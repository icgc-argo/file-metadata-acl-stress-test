import * as fetch from "isomorphic-fetch";
import gql from "graphql-tag";
import { print } from "graphql";

jest.setTimeout(60000);

const RECORD_COUNT = 900;

const query = gql`
  query($sqon: JSON) {
    file {
      hits(filters: $sqon, first: 900) {
        edges {
          node {
            file_type
            study_id
          }
        }
      }
    }
  }
`;

const getData = ({
  frontEndFilter,
  negativeFilter, // this one will simulate the backend filter
}): Promise<{
  data: {
    file: {
      hits: {
        edges: {
          node: {
            file_type: string;
            study_id: string;
          };
        }[];
      };
    };
  };
}> => {
  const variables = {
    sqon: {
      // This shows
      op: "and",
      content: [
        frontEndFilter,
        {
          op: "not",
          content: [negativeFilter],
        },
      ],
    },
  };
  return fetch("https://api.platform.icgc-argo.org/graphql", {
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "apollo-query-plan-experimental": "1",
      "content-type": "application/json",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ query: print(query), variables }),
    method: "POST",
  }).then((res) => res.json());
};

describe("stuff", () => {
  it("should handle no filter normally", async () => {
    const response = await getData({
      frontEndFilter: {
        op: "and",
        content: [],
      },
      negativeFilter: {
        op: "not",
        content: [],
      },
    });
    expect(response.data.file.hits.edges.length).toBe(RECORD_COUNT);
  });
  it("All files excluding CRAM files of non PACA-CA", async () => {
    const response = await getData({
      frontEndFilter: {
        op: "and",
        content: [],
      },
      negativeFilter: {
        op: "and",
        content: [
          {
            op: "in",
            content: {
              field: "file_type",
              value: ["CRAM"],
            },
          },
          {
            op: "not",
            content: [
              {
                op: "in",
                content: {
                  field: "study_id",
                  value: ["PACA-CA"],
                },
              },
            ],
          },
        ],
      },
    });
    expect(response.data.file.hits.edges.length).not.toBe(0);
    expect(
      response.data.file.hits.edges.some(
        (f) => f.node.file_type === "CRAM" && f.node.study_id === "PACA-CA"
      )
    ).toBe(true);
    expect(
      response.data.file.hits.edges.filter(
        (f) => f.node.file_type === "CRAM" && f.node.study_id === "PACA-CA"
      ).length
    ).toBe(
      response.data.file.hits.edges.filter((f) => f.node.file_type === "CRAM")
        .length
    );
    expect(
      response.data.file.hits.edges.filter(
        (f) => f.node.file_type === "CRAM" && f.node.study_id !== "PACA-CA"
      ).length
    ).toBe(0);
  });
  it("All files excluding CRAM files of non PACA-CA, should handle injection attack", async () => {
    const response = await getData({
      frontEndFilter: {
        op: "and",
        content: [
          {
            op: "in",
            content: {
              field: "file_type",
              value: ["CRAM"],
            },
          },
          {
            op: "not",
            content: [
              {
                op: "in",
                content: {
                  field: "study_id",
                  value: ["PACA-CA"],
                },
              },
            ],
          },
        ],
      },
      negativeFilter: {
        op: "and",
        content: [
          {
            op: "in",
            content: {
              field: "file_type",
              value: ["CRAM"],
            },
          },
          {
            op: "not",
            content: [
              {
                op: "in",
                content: {
                  field: "study_id",
                  value: ["PACA-CA"],
                },
              },
            ],
          },
        ],
      },
    });
    expect(response.data.file.hits.edges.length).toBe(0);
  });
});
