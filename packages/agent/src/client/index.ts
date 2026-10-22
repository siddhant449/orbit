// Client-safe entry: labels, grouping helpers and types. Nothing here imports a server package; the type
// re-exports are `export type`, so no server code reaches a client bundle.
export type { ActiveTask, ChatDataParts, ChatRequestBody, MessageMetadata } from "../types";
export type { ChatTools, ChatUIMessage } from "../tools";
export { HIDDEN_OUTPUT_TOOLS, isToolError, TOOL_LABELS, toolLabel, type ToolLabel, type ToolState } from "./labels";
export { groupChatsByDate, type HistoryGroupLabel } from "./history-groups";
export { collapseToolRuns, type ToolGroup } from "./tool-runs";
export { QUICK_LINKS, type QuickLinkKey } from "./quick-links";
export {
  applyDataPart,
  charCount,
  closePanel,
  emptyPanel,
  endStream,
  openPanel,
  panelCue,
  POST_CHAR_LIMIT,
  settleNeedsRefetch,
  withDocument,
  type PanelDoc,
  type PanelState,
} from "./document-state";
export { parseProposal, proposalStatus, type Proposal, type ProposalStatus } from "./proposal";
export { stripCitations } from "./sanitize";
