import { cn } from "cn";
import { ForwardRefRenderFunction, PropsWithoutRef, forwardRef } from "react";

// shadcn's own class merger (clsx + tailwind-merge in one). Components added with the shadcn CLI import it from "cn".
export { cn };
type ClassValue = Parameters<typeof cn>[number];

// forward refs
export function fr<T = HTMLElement, P = React.HTMLAttributes<T>>(
  component: ForwardRefRenderFunction<T, P>,
) {
  const wrapped = forwardRef(
    component as ForwardRefRenderFunction<T, PropsWithoutRef<P>>,
  );
  wrapped.displayName = component.name;
  return wrapped;
}

// // styled element
export function se<
  T = HTMLElement,
  P extends React.HTMLAttributes<T> = React.HTMLAttributes<T>,
>(Tag: keyof React.JSX.IntrinsicElements & string, ...classNames: ClassValue[]) {
  const component = fr<T, P>(({ className, ...props }, ref) => (
    // @ts-expect-error Too complicated for TypeScript
    <Tag ref={ref} className={cn(...classNames, className)} {...props} />
  ));
  component.displayName = Tag[0].toUpperCase() + Tag.slice(1);
  return component;
}
