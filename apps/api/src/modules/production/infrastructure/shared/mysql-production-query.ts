export const pagination = (query: {
  page?: number;
  pageSize?: number;
}): { page: number; pageSize: number; offset: number } => {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return { page, pageSize, offset: (page - 1) * pageSize };
};
export const placeholders = (values: { length: number }): string =>
  Array(values.length).fill('?').join(',');
