declare module 'react' {
  export const useState: any;
  export const useEffect: any;
  export const useMemo: any;
  const React: any;
  export default React;
}
declare module 'react-dom/client' {
  export const createRoot: any;
}
declare namespace JSX { interface IntrinsicElements { [elemName: string]: any } }
