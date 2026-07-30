type ProductWithDefaultRoute = {
  id: string;
  defaultRouteId: string | null;
};

type ProductRoute = {
  id: string;
  productId: string;
};

export const resolveDefaultRouteId = (
  productId: string,
  products: ProductWithDefaultRoute[],
  routes: ProductRoute[],
): string => {
  const productRoutes = routes.filter((route) => route.productId === productId);
  const defaultRouteId = products.find((product) => product.id === productId)?.defaultRouteId;

  return (
    productRoutes.find((route) => route.id === defaultRouteId)?.id ?? productRoutes[0]?.id ?? ''
  );
};
