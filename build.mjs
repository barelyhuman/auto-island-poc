import { build } from 'esbuild'
import fs from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { astFromCode } from '@dumbjs/preland/ast'

import {
  DEFAULT_TRANSPILED_IDENTIFIERS,
  findIslands,
  getIslandName,
  isFunctionIsland,
  readSourceFile,
} from '@dumbjs/preland'

await build({
  entryPoints: ['./src/server.js'],
  bundle: true,
  logLevel: 'info',
  platform: 'node',
  outdir: './dist',
  format: 'esm',
  jsx: 'automatic',
  entryNames: '[dir]/[name]',
  jsxImportSource: 'preact',
  loader: {
    '.js': 'jsx',
  },
  plugins: [resolveFauxIsland()],
})

/**
 * @returns {import("esbuild").Plugin}
 */
function resolveFauxIsland() {
  const importMap = new Map()
  const islandsPaths = new Map()
  const islandGenerated = {}
  return {
    name: 'resolve-faux-island',
    setup(builder) {
      builder.onEnd(async result => {
        await builder.esbuild.build({
          ...builder.initialOptions,
          format: 'esm',
          splitting: true,
          plugins: builder.initialOptions.plugins
            .filter(d => d.name !== 'resolve-faux-island')
            .concat(updateIslandSources(islandsPaths, islandGenerated)),
        })

        await builder.esbuild.build({
          ...builder.initialOptions,
          entryPoints: Object.keys(islandGenerated).map(
            d => islandGenerated[d].outputPath
          ),
          format: 'esm',
          outdir: join(builder.initialOptions.outdir, 'assets'),
          splitting: true,
          plugins: builder.initialOptions.plugins.filter(
            d => d.name !== 'resolve-faux-island'
          ),
        })
      })
      builder.onResolve({ filter: /\.(ts|js)x?$/ }, args => {
        if (args.importer) {
          const fullPath = join(dirname(args.importer), args.path)
          importMap.set(
            fullPath,
            (importMap.get(fullPath) || []).concat(args.importer)
          )
          return {
            path: fullPath,
          }
        }
        return
      })
      builder.onLoad({ filter: /\.(ts|js)x?$/ }, async args => {
        const code = await readSourceFile(args.path)
        const islands = findIslands(code, {
          isFunctionIsland: ast =>
            isFunctionIsland(ast, {
              transpiledIdentifiers: DEFAULT_TRANSPILED_IDENTIFIERS.concat([
                '_jsxDEV',
                'jsxDEV',
              ]),
            }),
        })
        if (islands.length == 0) return
        islandsPaths.set(args.path, {
          importers: importMap.get(args.path),
          islands,
        })

        for (let island of islands) {
          const outputPath = join('.islands', island.id + '.island.js')

          if (
            islandGenerated[island.id] &&
            islandGenerated[island.id].sourcePath === args.path
          )
            continue

          islandGenerated[island.id] = {
            sourcePath: args.path,
            outputPath: outputPath,
          }

          const islandName = getIslandName(island.id)
          await fs.promises.mkdir(dirname(outputPath), { recursive: true })
          await fs.promises.writeFile(
            outputPath,
            `import { render, h } from 'preact'

            if (!customElements.get('${islandName}')) {
              customElements.define(
                '${islandName}',
                class Island${island.id} extends HTMLElement {
                  constructor() {
                    super()
                  }
            
                  async connectedCallback() {
                    const c = await import('${args.path}')
                    const usableComponent = c['${island.id}']
                    const props = JSON.parse(this.dataset.props || '{}')
                    this.baseProps = props
                    this.component = usableComponent
                    this.renderOnView({ threshold: 0.2 })
                  }
            
                  renderOnView({ threshold } = {}) {
                    const options = {
                      root: null,
                      threshold,
                    }
            
                    const self = this
            
                    const callback = function (entries, observer) {
                      entries.forEach(entry => {
                        if (!entry.isIntersecting) return
                        self.renderIsland()
                      })
                    }
            
                    let observer = new IntersectionObserver(callback, options)
                    observer.observe(this)
                  }
            
                  renderIsland() {
                    render(h(this.component, this.baseProps), this)
                  }
                }
              )
            }
            `
          )
        }
      })
    },
  }
}

/**
 *
 * @param {Map<string,string[]>} islandPaths
 * @param {*} islandsGenerated
 * @returns {import("esbuild").Plugin}
 */
function updateIslandSources(islandPaths, islandsGenerated) {
  return {
    name: 'update-island-sources',
    setup(builder) {
      let keyImports = []
      for (let k of islandPaths.keys()) {
        const imports = islandPaths.get(k)
        keyImports.push(...imports.importers)
      }
      keyImports = [...new Set(keyImports)]
      const importerRegex = new RegExp(`(${keyImports.join('|')})`)

      builder.onLoad({ filter: importerRegex }, async args => {
        const islandsForFile = []

        for (let k of islandPaths.keys()) {
          const imports = islandPaths.get(k)
          if (!imports.importers.includes(args.path)) continue
          islandsForFile.push(...imports.islands)
        }

        if (islandsForFile.length === 0) return

        const transformedCode = await readSourceFile(args.path)
        let sourceCode = await fs.promises.readFile(args.path, 'utf8')
        const ast = astFromCode(transformedCode)

        for (let nodeIndex in ast.body) {
          const node = ast.body[nodeIndex]
          if (node.type !== 'ImportDeclaration') continue

          const islandNames = islandsForFile.map(d => d.id)
          const hasIslandImportSpecifier = node.specifiers.some(
            d =>
              d.imported.type === 'Identifier' &&
              islandNames.includes(d.imported.name)
          )

          if (!hasIslandImportSpecifier) continue

          // HACK: replace with proper ast manipulation of the rendered component
          // and also proper script path prediction
          islandNames.forEach(island => {
            sourceCode = sourceCode.replace(
              `<${island} />`,
              `<${getIslandName(island)}/>
              <script src="/${basename(islandsGenerated[island].outputPath)}" type="module"></script>
              `
            )
          })
        }

        return {
          contents: sourceCode,
          loader: 'jsx',
        }
      })
    },
  }
}
