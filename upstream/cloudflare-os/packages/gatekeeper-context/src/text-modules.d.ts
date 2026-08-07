// Type text-loader imports such as the bundled app HTML.
declare module "*.txt" {
  const content: string;
  export default content;
}
