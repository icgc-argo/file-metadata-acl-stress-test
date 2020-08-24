# High-level requirement

- Files are released through multiple stages
- Different users have access to files in different stages

-> given a file, we need to be able to tell its current release stage, then compare against the current user's access level to determine if it is accessible by the user.

This needs to be done at two level:

1. Presenting the right file metadata set in the UI, given the current viewing user.
2. Controlling the actual file download from Song / Score

**This design will focus on the first scenario, leaving the second open for discussion.**

# Specs

1. **File release stages:** more details are available in [this wiki](https://wiki.oicr.on.ca/display/icgcargotech/Data+Release). For our purpose, the following is worth noting:
   - Once a file is published by song, its metadata will be indexed into the Platform Elasticsearch.
   - The file will move through the following states for the rest of its life cycle, in order:
     1. **Embargo 1:** available to users who are member of the program which is associated with the file
     1. **Embargo 2:** available to all users who are part of a program which has a `full` membership
     1. **Embargo 3:** available to the above users, plus those who are part of a program which has a `associate` membership
     1. **Public queued:** no access difference from Embargo 2.
     1. **Publicly released:** general availability to the public, but can be either one of the following:
        - public open
          - metadata presented to everyone in file repo
          - downloadable by all users
        - public controlled
          - metadata presented to everyone in file repo
          - downloadable by users with DACO access
     1. Redacted: the file is revoked
2. **User access control:** A user can have one of 4 access levels:
   1. DCC member (inferable from JWT)
   1. Full program member (**needs work**)
   1. Associate program member (**needs work**)
   1. A public user (inferable from JWT / no JWT)

# The Problems

1. **File metadata:** The current file metadata (what's presented in the file repo) does not provide a way to tell the file's current release state.

2. **User access control:** Given a user, we currently cannot tell their access level easily. Currently, the Gateway would have to reach out to Program Service to get the program's membership type in order to infer the user's access. This can be done, however it is inefficient AND stateful, which is not consistent with our approach to access control implementation elsewhere (stateless).

# The Solutions

1. **File metadata:**
   We need two fields to identify :

   Field: `release_state`, possible values:

   - `EMBARGO_OWN_PROGRAM`
   - `EMBARGO_FULL_PROGRAMS`
   - `EMBARGO_ASSOCIATE_PROGRAMS`
   - `PUBLIC_QUEUE`
   - `PUBLIC`
   - `REDACTED`

   **Field mapping:**

   ```
   "release_state": {
     "type": "keyword"
   }
   ```

   We also need to update the existing files to include this field.

2. **User access control:** We want to have two new permissions available on the user's JWT:

   - `PROGRAMMEMBERSHIP-FULL.read`
   - `PROGRAMMEMBERSHIP-ASSOCIATE.read`

   These permissions can be included with the groups created by program service when it creates / updates a program.

   We also need to update the permissions associated with the existing groups.

# Implementation Plan:

1. **File metadata:** The release manager will be responsible for this, as the source of truth on a file's release state should live there.

2. **User access control:**

   1. Updates to `program-service`:

      1. The service's startup flow should be updated to sync up ego's group scopes with the associated program's member ship. After the the initialization is complete exits, the following must be true:

         - `PROGRAMMEMBERSHIP-FULL.read` exists in all **and only** ego user groups for programs with `FULL` membership
         - `PROGRAMMEMBERSHIP-ASSOCIATE.read` exists in all **and only** ego user groups for programs with `ASSOCIATE` membership

         Requirements:

         - This process should be idempotent so that future deployments of the application does not fail
         - should be feature flagged so we can turn it off the behavior later
         - TDD with test to:
           - confirm results
           - confirm re-run scenario

      1. `CreateProgram` rpc method needs to be updated to do the same thing as above for one program only.
      1. `UpdateProgram` rpc method needs to be updated to do the same thing as above for one program only.
         - TDD with test to confirm that only the right permission is attached to the groups.

   1. Updates to `ego-token-utils`: **write tests** and implement the following functions:

      1. `isFullProgramMember`
      2. `isAssociateProgramMember`

   1. Updates to `platform-api`: integrate with new Arranger feature to apply default SQON on every request (awaiting feature development).

      Use the updates from `ego-token-utils` above. Some pseudo-code (pending arranger investigation & implementation, please do a better job):

      ```tsx
      const ownProgramFilter = {
        // filters out files in EMBARGO_OWN_PROGRAM stage from OTHER programs
        op: "and",
        content: [
          {
            op: "in",
            content: {
              field: "release_state",
              values: ["EMBARGO_OWN_PROGRAM"],
            },
          },
          {
            op: "not",
            content: [
              {
                op: "in",
                content: {
                  field: "study_id",
                  values: [...usersProgramIds],
                },
              },
            ],
          },
        ],
      };
      const { schema: argoArrangerSchema } = (await createProjectSchema({
        getBlacklistFilter: () => {
          switch (true) {
            case isDccMember:
              return {
                // sees everything
                op: "and",
                content: [],
              };
            case isFullProgramMember:
              return ownProgramFilter;
            case isAssociateProgramMember:
              return {
                op: "and",
                content: [
                  ownProgramFilter,
                  {
                    // filters out files in EMBARGO_FULL_PROGRAMS from OTHER programs
                    op: "and",
                    content: [
                      {
                        op: "not",
                        content: [
                          {
                            op: "in",
                            content: {
                              field: "study_id",
                              values: [...usersProgramIds],
                            },
                          },
                        ],
                      },
                      {
                        op: "in",
                        content: {
                          field: "release_state",
                          values: ["EMBARGO_FULL_PROGRAMS"],
                        },
                      },
                    ],
                  },
                ],
              };
            default:
              // public user, logged in or not
              return {
                op: "not",
                content: [
                  {
                    op: "in",
                    content: {
                      field: "release_state",
                      values: ["PUBLIC"],
                    },
                  },
                ],
              };
          }
        },
      })) as { schema: GraphQLSchema };
      ```
