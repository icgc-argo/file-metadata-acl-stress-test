# ACL POC stress test

This contains a test used for validating the idea of using a "negative filter" to apply access control to file metadata in the file [repo](https://platform.icgc-argo.org/repository).

Refer to [this wiki](https://wiki.oicr.on.ca/display/icgcargotech/File+Metadata+Access+Control) for more context.

## Basic idea:

In order to apply access control, we need to apply additional filters to what is requested by the front-end, resulting in a final filter as below:

```
{
  op: "and",
  content: [
    frontEndFilter,
    {
      op: "not",
      content: [
        dynamicServerSideFilter
      ]
    }
  ]
}
```

The use of `not` operation is important to avoid injection attacks. without the `not` layer, `frontEndFilter` may request for resources that should not be accessible as according to `dynamicServerSideFilter`.

The test in this repo aims to confirm the ability to limit access to certain data based on this strategy. The specific of Argo' usecase is available in [this file]("./plan.md).
