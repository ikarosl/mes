const handledHttpErrors = new WeakSet<object>();

const isObject = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

export const markHttpErrorHandled = (error: unknown) => {
  if (isObject(error)) handledHttpErrors.add(error);
};

export const isHttpErrorHandled = (error: unknown) =>
  isObject(error) && handledHttpErrors.has(error);
