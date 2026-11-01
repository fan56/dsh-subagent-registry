import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelCatalogModel, ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types'
import type { PresetKey } from '../preset-contract.ts'
import { isDirty, type PresetsController } from './presets-state.ts'
import { stringsFor } from './strings.ts'
import styles from './PresetsPage.module.css'

export interface PresetsPageProps { controller: PresetsController }

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  )
}

function ModelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
    </svg>
  )
}

function ThinkingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  )
}

function BackgroundIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function DeepIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="9" r="3" />
      <path d="M6 9v6" />
      <path d="M9 9h3a3 3 0 0 1 3 3v-3" />
    </svg>
  )
}

function RoundsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

function EmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8.01" y2="16" />
      <line x1="16" y1="16" x2="16.01" y2="16" />
    </svg>
  )
}

function AgentAvatar({ name, isError }: { name: string; isError?: boolean }) {
  if (isError) {
    return (
      <div className={`${styles.avatar} ${styles.avatarError}`} aria-hidden="true">
        <WarningIcon className={styles.avatarIcon} />
      </div>
    )
  }
  const initial = name.trim().slice(0, 1).toUpperCase()
  return (
    <div className={styles.avatar} aria-hidden="true">
      {initial || '?'}
    </div>
  )
}

export function PresetsPage({ controller }: PresetsPageProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const t = stringsFor(state.language)
  const { draft, confirmation, busy } = state
  const issue = state.failure ?? state.listError
  const failure = issue?.field === 'id' ? { ...issue, field: 'name' } : issue
  const prefix = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const errorSummary = useRef<HTMLDivElement>(null)
  const [customModelMode, setCustomModelMode] = useState(false)
  const view = draft ? `${draft.mode}:${draft.original?.id ?? ''}` : 'list'
  useEffect(() => { controller.open() }, [controller])
  useEffect(() => { heading.current?.focus() }, [view])
  useEffect(() => { setCustomModelMode(false) }, [view])
  useEffect(() => {
    if (failure) {
      if (['deep', 'background', 'maxRounds'].includes(failure.field ?? '')) controller.advanced(true)
      errorSummary.current?.focus()
    }
  }, [controller, failure])
  const fieldId = (key: string) => `${prefix}-${key}`
  const fieldError = (key: string) => failure?.field === key ? failure.error : undefined
  const common = (key: string) => ({ id: fieldId(key), disabled: busy, 'aria-invalid': Boolean(fieldError(key)), 'aria-describedby': `${fieldId(key)}-hint${fieldError(key) ? ` ${fieldId(key)}-error` : ''}` })
  const field = (key: PresetKey | 'body' | 'source', hint: string, control: ReactNode, extraHeader?: ReactNode) => <div className={styles.field} data-state={fieldError(key) ? 'error' : busy ? 'disabled' : undefined}>
    <div className={styles.fieldHeader}>
      <label className={styles.label} htmlFor={fieldId(key)}>{t.labels[key]}</label>
      {extraHeader}
    </div>
    {control}
    <p className={styles.hint} id={`${fieldId(key)}-hint`}>{hint}</p>
    {fieldError(key) && <p className={styles.fieldError} id={`${fieldId(key)}-error`}>{fieldError(key)}</p>}
  </div>
  const input = (key: PresetKey, hint: string, extra: { readOnly?: boolean; required?: boolean; type?: string; min?: number; step?: number; placeholder?: string; list?: string } = {}) => field(key, hint,
    <Input {...common(key)} {...extra} className={styles.input} value={draft?.fields[key] ?? ''} onChange={event => controller.field(key, event.target.value)} />)
  const select = (key: 'thinking' | 'background', hint: string, options: readonly [string, string][], disabled = false) => field(key, hint,
    <select {...common(key)} disabled={disabled || busy} className={styles.control} value={draft?.fields[key] ?? ''} onChange={event => controller.field(key, event.target.value)}>
      {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>)
  const editable = draft?.mode === 'create' || draft?.mode === 'copy'
  const raw = draft?.mode === 'repair'
  const summaryField = failure?.field && failure.field in t.labels ? (raw && failure.field !== 'source' ? 'source' : failure.field) : undefined

  const catalogGroups: readonly ModelProviderGroup[] = state.catalog?.groups ?? []
  const defaultModelSelection = state.catalog?.default
  const defaultModelLabel = defaultModelSelection ? t.inheritDefaultRoute(`${defaultModelSelection.provider}/${defaultModelSelection.model}`) : t.inheritDefault
  const currentModel = draft?.fields[key_of('model')] ?? ''
  function key_of(k: PresetKey): PresetKey { return k }
  const isModelInCatalog = currentModel === '' || catalogGroups.some(g => g.models.some(m => `${g.id}/${m.id}` === currentModel))

  const onModelChange = (nextModel: string) => {
    controller.field('model', nextModel)
    const effectiveRoute = nextModel || (defaultModelSelection ? `${defaultModelSelection.provider}/${defaultModelSelection.model}` : '')
    let targetModelObj: ModelCatalogModel | undefined
    for (const group of catalogGroups) {
      for (const m of group.models) {
        if (`${group.id}/${m.id}` === effectiveRoute) {
          targetModelObj = m
          break
        }
      }
      if (targetModelObj) break
    }
    if (targetModelObj) {
      const efforts = targetModelObj.reasoning?.efforts ?? []
      if (efforts.length === 0) {
        if (draft?.fields.thinking) controller.field('thinking', '')
      } else if (draft?.fields.thinking && !efforts.some(e => e.id === draft.fields.thinking)) {
        controller.field('thinking', '')
      }
    }
  }

  const effectiveModelRoute = currentModel || (defaultModelSelection ? `${defaultModelSelection.provider}/${defaultModelSelection.model}` : '')
  let effectiveModelObj: ModelCatalogModel | undefined
  for (const group of catalogGroups) {
    for (const m of group.models) {
      if (`${group.id}/${m.id}` === effectiveModelRoute) {
        effectiveModelObj = m
        break
      }
    }
    if (effectiveModelObj) break
  }

  let thinkingOptions: [string, string][] = []
  let thinkingHint = t.thinkingHint
  let thinkingDisabled = false

  if (effectiveModelObj) {
    const reasoning = effectiveModelObj.reasoning
    if (reasoning?.efforts && reasoning.efforts.length > 0) {
      const defaultEffortNote = reasoning.defaultEffort ? ` (${reasoning.defaultEffort})` : ''
      thinkingOptions = [
        ['', t.inheritDefaultWithNote(defaultEffortNote)],
        ...reasoning.efforts.map(e => [
          e.id,
          e.name && e.name.toLowerCase() !== e.id.toLowerCase() ? `${e.name} (${e.id})` : e.id,
        ] as [string, string]),
      ]
      if (draft?.fields.thinking && !thinkingOptions.some(([val]) => val === draft.fields.thinking)) {
        thinkingOptions.push([draft.fields.thinking, t.thinkingUnlisted(draft.fields.thinking)])
      }
      thinkingHint = t.thinkingHintEfforts(reasoning.efforts.map(e => e.id).join(' / '))
    } else {
      thinkingOptions = [['', t.thinkingUnsupportedOption]]
      if (draft?.fields.thinking) {
        thinkingOptions.push([draft.fields.thinking, t.thinkingUnsupportedValue(draft.fields.thinking)])
      }
      thinkingHint = t.thinkingUnsupportedHint(effectiveModelObj.name)
      thinkingDisabled = true
    }
  } else {
    const fallbackLevels = ['off', 'low', 'medium', 'high', 'xhigh', 'max']
    thinkingOptions = [
      ['', t.thinkingInheritDeployment],
      ...fallbackLevels.map(l => [l, l] as [string, string]),
    ]
    if (draft?.fields.thinking && !thinkingOptions.some(([val]) => val === draft.fields.thinking)) {
      thinkingOptions.push([draft.fields.thinking, draft.fields.thinking])
    }
    if (state.catalogStatus === 'loading') {
      thinkingHint = t.thinkingLoading
    } else if (currentModel !== '') {
      thinkingHint = t.thinkingFallbackHint
    }
  }

  return <section className={styles.page} data-view={draft?.mode ?? 'list'} aria-busy={busy || state.status === 'loading'}>
    <div className={styles.content}>
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          {draft && <Button type="button" className={styles.action} variant="ghost" disabled={busy} onClick={() => controller.discard('list')}>{t.backToList}</Button>}
          <h1 ref={heading} tabIndex={-1} className={styles.title}>{draft ? t.titles[draft.mode] : t.agentsTitle}</h1>
          {draft?.mode === 'copy' && <p className={styles.hint}>{t.copiedFrom(draft.original?.id ?? '')}</p>}
        </div>
        <div className={styles.actions}>
          <Button type="button" className={styles.action} variant="outline" disabled={busy || state.status === 'loading'} onClick={() => controller.discard('refresh')}>{state.status === 'loading' ? t.refreshing : t.refresh}</Button>
          {!draft && <Button type="button" className={styles.action} variant="primary" disabled={busy || state.status !== 'ready'} onClick={() => controller.start('create')}>{t.createAgent}</Button>}
        </div>
      </header>
      <div className={styles.directory}>
        <div className={styles.directoryHeader}>
          <FolderIcon className={styles.directoryIcon} />
          {state.list && <p className={styles.directoryPath}>{t.directory(state.list.directory)}</p>}
        </div>
        <p className={styles.hint}>{t.directoryHint}</p>
      </div>
      {failure && <div ref={errorSummary} tabIndex={-1} role="alert" className={styles.errorSummary}>
        <p className={styles.errorTitle}>{state.failure ? t.errorActionIncomplete : t.errorReadFailed}</p>
        <p className={styles.errorText}>{failure.error}</p>
        {draft && summaryField && <a className={styles.errorLink} href={`#${fieldId(summaryField)}`} onClick={event => { event.preventDefault(); document.getElementById(fieldId(summaryField))?.focus() }}>{t.checkField(t.labels[summaryField as keyof typeof t.labels])}</a>}
        {draft && failure.code === 'source_required' && draft.mode === 'edit' && <Button type="button" className={styles.action} onClick={() => controller.discard('repair')}>{t.goToRepair}</Button>}
      </div>}
      {state.notice && <p className={styles.notice} role="status">{state.notice}</p>}
      {!draft ? <>
        {state.status === 'loading' && <p className={styles.status} role="status">{t.loadingPresets}</p>}
        {state.status === 'error' && <p className={styles.hint}>{t.refreshFailed(Boolean(state.list))}</p>}
        {state.status === 'ready' && state.list?.entries.length === 0 && (
          <div className={styles.empty}>
            <EmptyIcon className={styles.emptyIcon} />
            <h2 className={styles.emptyTitle}>{t.emptyTitle}</h2>
            <p className={styles.hint}>{t.emptyHint}</p>
            <Button type="button" className={styles.action} variant="primary" onClick={() => controller.start('create')}>{t.createAgent}</Button>
          </div>
        )}
        <div className={styles.list}>
          {state.list?.entries.map(entry => {
            const displayName = entry.fields.display_name || entry.id
            const isThinkingActive = Boolean(entry.fields.thinking && entry.fields.thinking !== 'off')
            const thinkingValue = entry.fields.thinking || t.inheritDefault
            const modelValue = entry.fields.model || t.inheritDefault

            return (
              <article
                key={entry.id}
                className={`${styles.card} ${styles.row}`}
                data-state={entry.error ? 'error' : 'ready'}
              >
                <div className={styles.cardHeader}>
                  <div className={styles.cardIdentity}>
                    <AgentAvatar name={displayName} isError={Boolean(entry.error)} />
                    <div className={styles.titleArea}>
                      <div className={`${styles.rowHeading} ${styles.titleRow}`}>
                        <h2 className={`${styles.rowTitle} ${styles.cardTitle}`}>{displayName}</h2>
                        <span className={`${styles.identifier} ${styles.filePill}`}>{`${entry.id}.md`}</span>
                        <span
                          className={`${styles.badge} ${styles.statusBadge}`}
                          data-status={entry.error ? 'error' : entry.structured ? 'ready' : 'unstructured'}
                        >
                          <span className={styles.statusDot} aria-hidden="true" />
                          {entry.error ? t.statusBadgeError : entry.structured ? t.statusBadgeReady : t.statusBadgeRaw}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`${styles.rowActions} ${styles.cardActions}`}>
                    <Button
                      type="button"
                      className={styles.action}
                      variant="outline"
                      aria-label={t.editAria(entry.id, Boolean(entry.error))}
                      disabled={busy || state.status !== 'ready'}
                      onClick={() => controller.start(entry.error || !entry.structured ? 'repair' : 'edit', entry)}
                    >
                      {entry.error ? t.titles.repair : entry.structured ? t.editAction : t.statusBadgeRaw}
                    </Button>
                    {!entry.error && entry.structured && (
                      <Button
                        type="button"
                        className={styles.action}
                        variant="outline"
                        aria-label={t.copyAria(entry.id)}
                        disabled={busy || state.status !== 'ready'}
                        onClick={() => controller.start('copy', entry)}
                      >
                        {t.copyAction}
                      </Button>
                    )}
                    <Button
                      type="button"
                      className={`${styles.action} ${styles.danger}`}
                      aria-label={t.deleteAria(entry.id)}
                      disabled={busy || state.status !== 'ready'}
                      onClick={() => controller.askDelete(entry)}
                    >
                      {t.deleteAction}
                    </Button>
                  </div>
                </div>

                <div className={`${styles.rowContent} ${styles.cardBody}`}>
                  {entry.error ? (
                    <div className={styles.cardErrorBox} role="alert">
                      <div className={styles.cardErrorHeader}>
                        <WarningIcon />
                        <span>{t.parseError}</span>
                      </div>
                      <p className={`${styles.errorText} ${styles.cardErrorText}`}>{entry.error}</p>
                    </div>
                  ) : (
                    <>
                      <p className={styles.description} data-empty={!entry.fields.description}>
                        {entry.fields.description || t.descriptionEmpty}
                      </p>
                      {!entry.structured && (
                        <p className={styles.unstructuredNotice}>
                          {t.unstructuredNotice}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {!entry.error && (
                  <div className={styles.cardMeta}>
                    <span className={styles.metaChip} data-kind="model" title={t.modelRouteTitle(modelValue)}>
                      <ModelIcon className={styles.chipIcon} />
                      <span className={styles.chipLabel}>{t.modelChipLabel}</span>
                      <span className={styles.chipValue}>{modelValue}</span>
                    </span>

                    <span
                      className={styles.metaChip}
                      data-kind="thinking"
                      data-active={isThinkingActive ? 'true' : 'false'}
                      data-level={entry.fields.thinking || 'default'}
                      title={t.thinkingChipTitle(thinkingValue)}
                    >
                      <ThinkingIcon className={styles.chipIcon} />
                      <span className={styles.chipLabel}>{t.thinkingChipLabel}</span>
                      <span className={styles.chipValue}>{thinkingValue}</span>
                    </span>

                    {entry.fields.background && (
                      <span
                        className={styles.metaChip}
                        data-kind="background"
                        title={entry.fields.background === 'true' ? t.backgroundContinuousTitle : t.backgroundOnceTitle}
                      >
                        <BackgroundIcon className={styles.chipIcon} />
                        <span className={styles.chipValue}>
                          {entry.fields.background === 'true' ? t.backgroundContinuous : t.backgroundForeground}
                        </span>
                      </span>
                    )}

                    {entry.fields.deep !== undefined && entry.fields.deep !== '' && (
                      <span
                        className={styles.metaChip}
                        data-kind="deep"
                        title={entry.fields.deep === '0' ? t.deepLeafTitle : t.deepDispatchTitle(entry.fields.deep)}
                      >
                        <DeepIcon className={styles.chipIcon} />
                        <span className={styles.chipValue}>
                          {entry.fields.deep === '0' ? t.deepLeaf : t.deepValue(entry.fields.deep)}
                        </span>
                      </span>
                    )}

                    {entry.fields.maxRounds && (
                      <span
                        className={styles.metaChip}
                        data-kind="rounds"
                        title={t.roundsTitle(entry.fields.maxRounds)}
                      >
                        <RoundsIcon className={styles.chipIcon} />
                        <span className={styles.chipValue}>{t.roundsValue(entry.fields.maxRounds)}</span>
                      </span>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </> : <form className={styles.form} onSubmit={event => { event.preventDefault(); void controller.save() }}>
        {input('name', editable ? t.nameHintEditable : t.nameHintFixed, { readOnly: !editable, required: true })}
        {raw ? <>
          {draft.original?.error && <div className={styles.diagnostic}><p className={styles.errorTitle}>{t.diagnosticTitle}</p><p className={styles.errorText}>{draft.original.error}</p></div>}
          {field('source', t.sourceHint(draft.original!.id), <textarea {...common('source')} className={`${styles.control} ${styles.source}`} value={draft.source} spellCheck={false} onChange={event => controller.text('source', event.target.value)} />)}
        </> : <>
          {input('display_name', t.displayNameHint)}
          {input('description', t.descriptionHint)}
          {customModelMode ? field('model', t.customModelHint,
            <Input {...common('model')} className={styles.input} placeholder={t.customModelPlaceholder} value={currentModel} onChange={event => onModelChange(event.target.value)} />,
            <button type="button" className={styles.toggleCustom} onClick={() => setCustomModelMode(false)}>{t.selectFromList}</button>
          ) : field('model', t.catalogModelHint,
            <select
              {...common('model')}
              className={styles.control}
              value={currentModel}
              onChange={event => {
                const val = event.target.value
                if (val === '__custom__') setCustomModelMode(true)
                else onModelChange(val)
              }}
            >
              <option value="">{defaultModelLabel}</option>
              {catalogGroups.map(group => (
                <optgroup key={group.id} label={group.name}>
                  {group.models.map(m => (
                    <option key={`${group.id}/${m.id}`} value={`${group.id}/${m.id}`}>
                      {m.name} ({group.id}/{m.id})
                    </option>
                  ))}
                </optgroup>
              ))}
              {!isModelInCatalog && currentModel !== '' && (
                <optgroup label={t.notInCatalogGroup}>
                  <option value={currentModel}>{currentModel}</option>
                </optgroup>
              )}
              <option value="__custom__">{t.customInputOption}</option>
            </select>,
            <button type="button" className={styles.toggleCustom} onClick={() => setCustomModelMode(true)}>{t.customInputButton}</button>
          )}
          {state.catalogStatus === 'loading' && <p className={styles.hint} role="status">{t.loadingCatalog}</p>}
          {state.catalogError && <div className={styles.catalogError} role="status"><p className={styles.errorText}>{t.catalogError(state.catalogError)}</p><p className={styles.hint}>{t.catalogErrorHint}</p><Button type="button" className={styles.action} disabled={busy || state.catalogStatus === 'loading'} onClick={() => { void controller.loadModels() }}>{t.retryCatalog}</Button></div>}
          {state.catalog?.failures.map(item => <p className={styles.errorText} key={item.id}>{t.catalogFailure(item.name, item.message)}</p>)}
          {select('thinking', thinkingHint, thinkingOptions, thinkingDisabled)}
          {field('body', t.bodyHint, <textarea {...common('body')} className={`${styles.control} ${styles.body}`} value={draft.body} onChange={event => controller.text('body', event.target.value)} />)}
          <details className={styles.advanced} open={draft.advanced} onToggle={event => controller.advanced(event.currentTarget.open)}>
            <summary className={styles.advancedToggle}>{t.advancedTitle}</summary>
            <div className={styles.advancedFields}>
              {input('deep', t.deepHint, { type: 'number', min: 0, step: 1, placeholder: t.deepPlaceholder })}
              {select('background', t.backgroundHint, [['', t.backgroundInheritOption], ['false', t.backgroundFalseOption], ['true', t.backgroundTrueOption]])}
              {input('maxRounds', t.maxRoundsHint, { type: 'number', min: 1, step: 1, placeholder: t.maxRoundsPlaceholder })}
            </div>
          </details>
        </>}
        <footer className={styles.formFooter}>
          <p className={styles.hint} role="status">{busy ? t.saving : isDirty(draft) ? t.unsavedChanges : t.noChanges}</p>
          <div className={styles.actions}>
            <Button type="button" className={styles.action} variant="outline" disabled={busy} onClick={() => controller.discard('list')}>{t.cancel}</Button>
            <Button type="submit" className={styles.action} variant="primary" disabled={busy || (!editable && !isDirty(draft))}>{busy ? t.saving : t.savePreset}</Button>
          </div>
        </footer>
      </form>}
    </div>
    <Modal open={Boolean(confirmation)} onClose={() => controller.cancelConfirmation()} title={confirmation?.kind === 'delete' ? t.deleteConfirmTitle(confirmation.entry.id) : confirmation?.kind === 'display' ? t.displayNameConfirmTitle : t.discardConfirmTitle} closeLabel={t.closeLabel} footer={<div className={styles.actions}><Button type="button" className={styles.action} data-modal-autofocus disabled={busy} onClick={() => controller.cancelConfirmation()}>{t.cancel}</Button><Button type="button" className={styles.action} variant="primary" disabled={busy} onClick={() => { void controller.confirm() }}>{confirmation?.kind === 'delete' ? t.confirmDelete : confirmation?.kind === 'display' ? t.confirmSave : t.discardChanges}</Button></div>}>
      <p className={styles.confirmText}>{confirmation?.kind === 'delete' ? t.deleteConfirmText(confirmation.entry.id) : confirmation?.kind === 'display' ? t.displayNameConfirmText : confirmation?.kind === 'discard' && confirmation.action === 'refresh' ? t.discardRefreshText : confirmation?.kind === 'discard' && confirmation.action === 'repair' ? t.discardRepairText : t.discardListText}</p>
      {confirmation?.kind === 'delete' && <p className={styles.directoryPath}>{t.directory(state.list?.directory ?? '')}</p>}
      {confirmation?.kind === 'display' && <p className={styles.directoryPath}>{t.confirmTarget(confirmation.request.id)}</p>}
    </Modal>
  </section>
}
