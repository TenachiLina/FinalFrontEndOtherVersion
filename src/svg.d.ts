// svg.d.ts
// SVG files go through @svgr/webpack (see next.config.ts): importing one
// gives a React component, e.g. <PlusIcon className="h-4 w-4" />.
declare module "*.svg" {
  import * as React from "react";
  const SvgComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;
  export default SvgComponent;
}
