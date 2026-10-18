import { LuLoaderCircle } from "react-icons/lu";

// Simple centred spinner while a projects page loads - same icon as AppLoader.
const PageLoader = () => (
  <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center">
    <LuLoaderCircle
      className="size-7 animate-spin text-foreground"
      aria-hidden="true"
    />
  </div>
);

export default PageLoader;
