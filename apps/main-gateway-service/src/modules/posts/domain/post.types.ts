export type FileDataViewType = {
  id: string;
  fileId: string;
  url: string;
  order: number;
};

export type PostViewType = {
  id: string;
  ownerId: string;
  description: string;
  images: FileDataViewType[];
  createdAt: Date;
  updatedAt: Date;
};
