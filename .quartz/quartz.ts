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
    return a.displayName.localeCompare(b.displayName, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  },
})

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
