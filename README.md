# auto-island-poc

`auto-island-poc` is a research and experimental build script that uses `esbuild`
to bundle and transform JavaScript/TypeScript files, specifically focusing on
handling "islands" of functionality. These islands are components that are
dynamically imported and rendered when they come into view, optimizing the
initial load time of your application.

## Expectations

- **Dynamic Importing**: Identifies and dynamically imports "islands" of
  functionality.
- **Chunking**: Allow proper chunking of deps

## Report

- Mostly went well, just need to make a realiable ast modifier to remove
  rendered components and replace them with the web components
- Another thing is that the build requires 2 passes, one to identify and one to
  update the code, I need a way to generate the module graph before the plugin
  execution start
- Finally, will also require additional tooling on the server to statically
  render web-components.

## Usage / Development

1. Clone the repo
2. Install deps

```sh
pnpm i
```

3. Build the code

```sh
node build.mjs
```

This will bundle your application and handle the dynamic importing of island
components, outputting the results to the `./dist` directory.

4. run the server

```sh
node ./dist/server.js
```
