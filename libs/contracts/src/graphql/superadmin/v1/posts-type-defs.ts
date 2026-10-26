export const SUPERADMIN_POSTS_TYPE_DEFS = `
  input SuperadminPostsInput { first: Int! = 4, after: String, searchUsername: String }
  input SuperadminPostPublishedInput { searchUsername: String }
  type SuperadminPostImage { fileId: ID!, url: String, order: Int! }
  type SuperadminPost { postId: ID!, userId: ID!, username: String, description: String!, publishedAt: DateTime!, images: [SuperadminPostImage!]! }
  type SuperadminPostsPageInfo { endCursor: String, hasNextPage: Boolean! }
  type SuperadminPostsConnection { items: [SuperadminPost!]!, pageInfo: SuperadminPostsPageInfo! }
  enum SuperadminPostPublishedEventKind { READY POST_PUBLISHED RESYNC_REQUIRED }
  type SuperadminPostPublishedEvent { kind: SuperadminPostPublishedEventKind!, post: SuperadminPost }
  extend type Query { superadminPosts(input: SuperadminPostsInput!): SuperadminPostsConnection }
  type Subscription { superadminPostPublished(input: SuperadminPostPublishedInput!): SuperadminPostPublishedEvent! }
`;
