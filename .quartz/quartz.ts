// Replaces Quartz's quartz.ts during the build (see .quartz/build.sh).
// Only used for settings that need code; everything else is in quartz.config.yaml.
import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import * as ExternalPlugin from "./.quartz/plugins"

// Explorer order. These functions run in visitors' browsers, so the list
// has to live inside them. Folders not listed go after these, A-Z.
ExternalPlugin.Explorer({
  sortFn: (a, b) => {
    const order = [
      "the-hierophant-project---home",
      "campaigns",
      "history",
      "factions",
      "populations",
      "major-powers",
      "important-locations",
      "monad-city-ferraphex",
    ]
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
    const ra = order.indexOf(a.slugSegment)
    const rb = order.indexOf(b.slugSegment)
    if (ra !== rb) return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb)
    // Campaign logs named "YYYY-MM-DD ..." go after other pages, newest first
    const da = /^\d{4}-\d{2}-\d{2}/.test(a.displayName)
    const db = /^\d{4}-\d{2}-\d{2}/.test(b.displayName)
    if (da !== db) return da ? 1 : -1
    if (da && db) return b.displayName.localeCompare(a.displayName)
    // Sort by file name, so a "1 " prefix still orders pages...
    return a.slugSegment.localeCompare(b.slugSegment, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  },
  // ...but don't show the prefix ("1 The HIEROPHANT Project" -> "The HIEROPHANT Project")
  mapFn: (node) => {
    node.displayName = node.displayName.replace(/^\d+\s+/, "")
  },
  order: ["filter", "map", "sort"],
})

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
