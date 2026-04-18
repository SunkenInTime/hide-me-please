import { useEffect, useState } from "react"

const STORAGE_KEY = "textReplacementSettings"
const REFRESH_MESSAGE = "refresh-replacements"

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

const createReplacementRule = (
  values: Partial<Omit<ReplacementRule, "id">> = {}
): ReplacementRule => ({
  id:
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  searchText: values.searchText ?? "",
  replacementText: values.replacementText ?? ""
})

const normalizeSettings = (
  rawValue: Partial<ReplacementSettings> & {
    searchText?: string
    replacementText?: string
  }
): ReplacementSettings => {
  const replacements = Array.isArray(rawValue.replacements)
    ? rawValue.replacements.map((replacement) =>
        createReplacementRule({
          searchText: replacement?.searchText ?? "",
          replacementText: replacement?.replacementText ?? ""
        })
      )
    : []

  if (
    replacements.length === 0 &&
    (rawValue.searchText !== undefined || rawValue.replacementText !== undefined)
  ) {
    replacements.push(
      createReplacementRule({
        searchText: rawValue.searchText ?? "",
        replacementText: rawValue.replacementText ?? ""
      })
    )
  }

  return {
    enabled: rawValue.enabled ?? defaultSettings.enabled,
    replacements
  }
}

const serializeSettings = (settings: ReplacementSettings): string =>
  JSON.stringify(settings)

function IndexPopup() {
  const [settings, setSettings] = useState<ReplacementSettings>(defaultSettings)
  const [revealedReplacementId, setRevealedReplacementId] = useState<string | null>(
    null
  )
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] = useState(
    serializeSettings(defaultSettings)
  )

  useEffect(() => {
    void chrome.storage.sync.get(STORAGE_KEY).then((stored) => {
      const rawValue = stored[STORAGE_KEY] as
        | (Partial<ReplacementSettings> & {
            searchText?: string
            replacementText?: string
          })
        | undefined

      const normalizedSettings = normalizeSettings(rawValue ?? defaultSettings)
      setSettings(normalizedSettings)
      setSavedSettingsSnapshot(serializeSettings(normalizedSettings))
    })
  }, [])

  const refreshActiveTab = async (): Promise<void> => {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    })

    if (!activeTab?.id) {
      return
    }

    try {
      await chrome.tabs.sendMessage(activeTab.id, {
        type: REFRESH_MESSAGE
      })
    } catch {
      // Ignore pages where the content script is not available.
    }
  }

  const persistSettings = async (): Promise<void> => {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: settings
    })

    await refreshActiveTab()
    setSavedSettingsSnapshot(serializeSettings(settings))
  }

  const hasUnsavedChanges =
    serializeSettings(settings) !== savedSettingsSnapshot

  const updateReplacement = (
    replacementId: string,
    field: "searchText" | "replacementText",
    value: string
  ): void => {
    setSettings((current) => ({
      ...current,
      replacements: current.replacements.map((replacement) =>
        replacement.id === replacementId
          ? {
              ...replacement,
              [field]: value
            }
          : replacement
      )
    }))
  }

  const addReplacement = (): void => {
    setSettings((current) => ({
      ...current,
      replacements: [...current.replacements, createReplacementRule()]
    }))
  }

  const deleteReplacement = (replacementId: string): void => {
    setSettings((current) => ({
      ...current,
      replacements: current.replacements.filter(
        (replacement) => replacement.id !== replacementId
      )
    }))
  }

  return (
    <div
      style={{
        padding: "10px 12px 12px",
        width: 300,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#0f172a",
        backgroundColor: "#f1f5f9",
        fontSize: 12
      }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8
        }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            paddingBottom: 6,
            borderBottom: "1px solid #cbd5e1"
          }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Hide Me Please</span>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontWeight: 500,
              color: "#334155",
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}>
            <input
              checked={settings.enabled}
              onChange={(event) => {
                setSettings((current) => ({
                  ...current,
                  enabled: event.target.checked
                }))
              }}
              type="checkbox"
            />
            On
          </label>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6
          }}>
          {settings.replacements.map((replacement, index) => {
            const isSearchTextVisible =
              revealedReplacementId === replacement.id ||
              replacement.searchText.length === 0

            return (
              <div
                key={replacement.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  padding: "6px 8px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  backgroundColor: "#ffffff",
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)"
                }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    minHeight: 22
                  }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em"
                    }}>
                    Rule {index + 1}
                  </span>
                  <button
                    aria-label={`Remove rule ${index + 1}`}
                    onClick={() => deleteReplacement(replacement.id)}
                    style={{
                      width: 22,
                      height: 22,
                      padding: 0,
                      lineHeight: "20px",
                      borderRadius: 4,
                      border: "1px solid #e2e8f0",
                      backgroundColor: "#fff",
                      color: "#b91c1c",
                      fontSize: 14,
                      cursor: "pointer"
                    }}
                    title="Remove"
                    type="button">
                    x
                  </button>
                </div>

                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#475569"
                  }}>
                  <span>Find (hover to reveal)</span>
                  <input
                    onBlur={() => {
                      setRevealedReplacementId((current) =>
                        current === replacement.id ? null : current
                      )
                    }}
                    onChange={(event) =>
                      updateReplacement(
                        replacement.id,
                        "searchText",
                        event.target.value
                      )
                    }
                    onFocus={() => {
                      setRevealedReplacementId(replacement.id)
                    }}
                    onMouseEnter={() => {
                      setRevealedReplacementId(replacement.id)
                    }}
                    onMouseLeave={() => {
                      setRevealedReplacementId((current) =>
                        current === replacement.id ? null : current
                      )
                    }}
                    style={{
                      padding: "5px 7px",
                      borderRadius: 4,
                      border: "1px solid #cbd5e1",
                      fontSize: 12,
                      filter: isSearchTextVisible ? "none" : "blur(5px)",
                      transition: "filter 120ms ease"
                    }}
                    type="text"
                    value={replacement.searchText}
                  />
                </label>

                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#475569"
                  }}>
                  <span>Replace with</span>
                  <input
                    onChange={(event) =>
                      updateReplacement(
                        replacement.id,
                        "replacementText",
                        event.target.value
                      )
                    }
                    style={{
                      padding: "5px 7px",
                      borderRadius: 4,
                      border: "1px solid #cbd5e1",
                      fontSize: 12
                    }}
                    type="text"
                    value={replacement.replacementText}
                  />
                </label>
              </div>
            )
          })}

          <button
            onClick={addReplacement}
            style={{
              padding: "5px 8px",
              borderRadius: 4,
              border: "1px dashed #94a3b8",
              backgroundColor: "transparent",
              color: "#475569",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer"
            }}
            type="button">
            + Add rule
          </button>
        </div>

        <div style={{ paddingTop: 2 }}>
          <button
            onClick={() => void persistSettings()}
            style={{
              width: "100%",
              padding: "7px 10px",
              borderRadius: 5,
              border: hasUnsavedChanges
                ? "1px solid #b45309"
                : "1px solid #94a3b8",
              backgroundColor: hasUnsavedChanges ? "#f59e0b" : "#e2e8f0",
              color: hasUnsavedChanges ? "#1f2937" : "#475569",
              fontSize: 12,
              fontWeight: 600,
              cursor: hasUnsavedChanges ? "pointer" : "default",
              transition: "background-color 120ms ease, border-color 120ms ease"
            }}
            disabled={!hasUnsavedChanges}
            type="button">
            {hasUnsavedChanges ? "Save changes" : "All changes saved"}
          </button>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 10,
            lineHeight: 1.35,
            color: "#64748b"
          }}>
          Replaces text on HTTP/HTTPS pages without changing HTML tags.
        </p>
      </div>
    </div>
  )
}

export default IndexPopup
