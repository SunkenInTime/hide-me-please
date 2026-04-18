import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  all_frames: true,
  run_at: "document_start"
}

const STORAGE_KEY = "textReplacementSettings"
const REFRESH_MESSAGE = "refresh-replacements"
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "OPTION",
  "SELECT"
])

const REPLACEABLE_ATTRIBUTES = [
  "aria-label",
  "aria-placeholder",
  "alt",
  "placeholder",
  "title",
  "value"
] as const

type ReplacementRule = {
  id: string
  searchText: string
  replacementText: string
}

type ReplacementSettings = {
  enabled: boolean
  replacements: ReplacementRule[]
}

const defaultSettings: ReplacementSettings = {
  enabled: true,
  replacements: []
}

let currentSettings: ReplacementSettings = defaultSettings
let observer: MutationObserver | null = null
let isApplyingMutations = false
const originalTextValues = new WeakMap<Text, string>()
const originalAttributeValues = new WeakMap<Element, Map<string, string>>()

const getStorageArea = (): typeof chrome.storage.sync => chrome.storage.sync

const shouldSkipTextNode = (node: Text): boolean => {
  const parentElement = node.parentElement
  if (!parentElement) {
    return true
  }

  if (SKIP_TAGS.has(parentElement.tagName)) {
    return true
  }

  return parentElement.isContentEditable
}

const normalizeSettings = (
  rawValue: Partial<ReplacementSettings> & {
    searchText?: string
    replacementText?: string
  }
): ReplacementSettings => {
  const replacements = Array.isArray(rawValue.replacements)
    ? rawValue.replacements.map((replacement, index) => ({
        id: replacement?.id ?? `replacement-${index}`,
        searchText: replacement?.searchText ?? "",
        replacementText: replacement?.replacementText ?? ""
      }))
    : []

  if (
    replacements.length === 0 &&
    (rawValue.searchText !== undefined || rawValue.replacementText !== undefined)
  ) {
    replacements.push({
      id: "replacement-0",
      searchText: rawValue.searchText ?? "",
      replacementText: rawValue.replacementText ?? ""
    })
  }

  return {
    enabled: rawValue.enabled ?? defaultSettings.enabled,
    replacements
  }
}

const getActiveReplacements = (): ReplacementRule[] =>
  currentSettings.enabled
    ? currentSettings.replacements.filter((replacement) => replacement.searchText)
    : []

const getOriginalTextValue = (node: Text): string => {
  const existingValue = originalTextValues.get(node)
  if (existingValue !== undefined) {
    return existingValue
  }

  originalTextValues.set(node, node.data)
  return node.data
}

const setOriginalTextValue = (node: Text, value: string): void => {
  originalTextValues.set(node, value)
}

const getOriginalAttributeValue = (
  element: Element,
  attributeName: (typeof REPLACEABLE_ATTRIBUTES)[number]
): string | null => {
  let attributeValues = originalAttributeValues.get(element)

  if (!attributeValues) {
    attributeValues = new Map<string, string>()
    originalAttributeValues.set(element, attributeValues)
  }

  if (attributeValues.has(attributeName)) {
    return attributeValues.get(attributeName) ?? null
  }

  const currentValue = element.getAttribute(attributeName)
  if (currentValue !== null) {
    attributeValues.set(attributeName, currentValue)
  }

  return currentValue
}

const setOriginalAttributeValue = (
  element: Element,
  attributeName: (typeof REPLACEABLE_ATTRIBUTES)[number],
  value: string | null
): void => {
  let attributeValues = originalAttributeValues.get(element)

  if (!attributeValues) {
    attributeValues = new Map<string, string>()
    originalAttributeValues.set(element, attributeValues)
  }

  if (value === null) {
    attributeValues.delete(attributeName)
    return
  }

  attributeValues.set(attributeName, value)
}

const replaceAllOccurrences = (sourceText: string): string => {
  let nextValue = sourceText

  for (const replacement of getActiveReplacements()) {
    nextValue = nextValue
      .split(replacement.searchText)
      .join(replacement.replacementText)
  }

  return nextValue
}

const applyReplacementToTextNode = (node: Text): void => {
  if (shouldSkipTextNode(node)) {
    return
  }

  const sourceValue = getOriginalTextValue(node)
  const nextValue =
    getActiveReplacements().length === 0
      ? sourceValue
      : replaceAllOccurrences(sourceValue)

  if (nextValue === node.data) {
    return
  }

  isApplyingMutations = true
  node.data = nextValue
  isApplyingMutations = false
}

const applyReplacementToAttributes = (element: Element): void => {
  isApplyingMutations = true

  for (const attributeName of REPLACEABLE_ATTRIBUTES) {
    const sourceValue = getOriginalAttributeValue(element, attributeName)
    if (sourceValue === null) {
      continue
    }

    const nextValue =
      getActiveReplacements().length === 0
        ? sourceValue
        : replaceAllOccurrences(sourceValue)

    if (nextValue !== element.getAttribute(attributeName)) {
      element.setAttribute(attributeName, nextValue)
    }
  }

  isApplyingMutations = false
}

const createTextWalker = (root: Node): TreeWalker =>
  document.createTreeWalker(root, NodeFilter.SHOW_TEXT)

const createElementWalker = (root: Node): TreeWalker =>
  document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)

const applyReplacementToShadowRoot = (shadowRoot: ShadowRoot): void => {
  applyReplacementToSubtree(shadowRoot)
  startObserver(shadowRoot)
}

const applyReplacementToElement = (element: Element): void => {
  applyReplacementToAttributes(element)

  if (element.shadowRoot) {
    applyReplacementToShadowRoot(element.shadowRoot)
  }
}

const applyReplacementToSubtree = (root: Node): void => {
  if (root.nodeType === Node.TEXT_NODE) {
    applyReplacementToTextNode(root as Text)
    return
  }

  if (root.nodeType === Node.ELEMENT_NODE) {
    applyReplacementToElement(root as Element)
  }

  if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && root instanceof ShadowRoot) {
    const shadowChildren = Array.from(root.children)
    for (const child of shadowChildren) {
      applyReplacementToElement(child)
    }
  }

  const walker = createTextWalker(root)
  let currentNode = walker.nextNode()
  while (currentNode) {
    applyReplacementToTextNode(currentNode as Text)
    currentNode = walker.nextNode()
  }

  const elementWalker = createElementWalker(root)
  let currentElement = elementWalker.nextNode()
  while (currentElement) {
    applyReplacementToElement(currentElement as Element)
    currentElement = elementWalker.nextNode()
  }
}

const loadSettings = async (): Promise<ReplacementSettings> => {
  const stored = await getStorageArea().get(STORAGE_KEY)
  const rawValue = stored[STORAGE_KEY] as
    | (Partial<ReplacementSettings> & {
        searchText?: string
        replacementText?: string
      })
    | undefined

  return normalizeSettings(rawValue ?? defaultSettings)
}

const refreshWholeDocument = (): void => {
  const root = document.body ?? document.documentElement
  if (!root) {
    return
  }

  applyReplacementToSubtree(root)
}

const handleMutations = (mutations: MutationRecord[]): void => {
  if (isApplyingMutations) {
    return
  }

  for (const mutation of mutations) {
    if (mutation.type === "characterData" && mutation.target.nodeType === Node.TEXT_NODE) {
      const textNode = mutation.target as Text
      setOriginalTextValue(textNode, textNode.data)
      applyReplacementToTextNode(textNode)
      continue
    }

    if (
      mutation.type === "attributes" &&
      mutation.target.nodeType === Node.ELEMENT_NODE
    ) {
      const element = mutation.target as Element
      const attributeName = mutation.attributeName as
        | (typeof REPLACEABLE_ATTRIBUTES)[number]
        | null

      if (attributeName) {
        setOriginalAttributeValue(
          element,
          attributeName,
          element.getAttribute(attributeName)
        )
      }

      applyReplacementToElement(element)
      continue
    }

    if (mutation.type !== "childList") {
      continue
    }

    for (const addedNode of mutation.addedNodes) {
      applyReplacementToSubtree(addedNode)
    }
  }
}

const startObserver = (root: Node = document.documentElement): void => {
  if (!root) {
    return
  }

  if (root === document.documentElement && observer) {
    return
  }

  const nextObserver = new MutationObserver(handleMutations)
  nextObserver.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...REPLACEABLE_ATTRIBUTES]
  })

  if (root === document.documentElement) {
    observer = nextObserver
  }
}

const bootstrap = async (): Promise<void> => {
  currentSettings = await loadSettings()
  startObserver()
  refreshWholeDocument()
}

void bootstrap()

document.addEventListener("DOMContentLoaded", () => {
  refreshWholeDocument()
})

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== REFRESH_MESSAGE) {
    return
  }

  void (async () => {
    currentSettings = await loadSettings()
    refreshWholeDocument()
  })()
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !(STORAGE_KEY in changes)) {
    return
  }

  const nextValue = changes[STORAGE_KEY]?.newValue as Partial<ReplacementSettings> | undefined
  currentSettings = normalizeSettings(
    (nextValue as Partial<ReplacementSettings> & {
      searchText?: string
      replacementText?: string
    }) ?? defaultSettings
  )

  refreshWholeDocument()
})
