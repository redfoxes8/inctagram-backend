// Shared schema-first primitives. This fragment alone is not an executable schema.
export const SUPERADMIN_CONTRACT_VERSION = '1.1.0';
export const SUPERADMIN_COMMON_TYPE_DEFS = `
  scalar DateTime
  input PageInput { page: Int! = 1, pageSize: Int! = 8 }
  type PageInfo { page: Int!, pageSize: Int!, pagesCount: Int!, hasNextPage: Boolean! }
`;
