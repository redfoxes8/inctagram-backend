export const SUPERADMIN_USER_PHOTOS_TYPE_DEFS = `
  type SuperadminUserPhoto { imageId: ID!, postId: ID!, url: String }
  type SuperadminUserPhotosConnection { items: [SuperadminUserPhoto!]!, totalCount: Int!, pageInfo: PageInfo! }
  extend type SuperadminUser { uploadedPhotos(input: PageInput!): SuperadminUserPhotosConnection }
`;
