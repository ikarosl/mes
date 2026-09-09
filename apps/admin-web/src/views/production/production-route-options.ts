type ProductWithDefaultRoute = {
  id: string;
  defaultRouteId: string | null;
};

type ProductRoute = {
  id: string;
};

export const resolveDefaultRouteId = (
  productId: string,
  products: ProductWithDefaultRoute[],
  routes: ProductRoute[],
): string => {
  const defaultRouteId = products.find((product) => product.id === productId)?.defaultRouteId;
  return routes.find((route) => route.id === defaultRouteId)?.id ?? routes[0]?.id ?? '';
};
