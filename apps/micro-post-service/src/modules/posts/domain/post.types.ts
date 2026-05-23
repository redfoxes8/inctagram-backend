export type FileDataType = {
  files: { [key: string]: { fileId: string; fileUrl: string } };
};

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
