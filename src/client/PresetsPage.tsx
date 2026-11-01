import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelCatalogModel, ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types'
import type { PresetKey } from '../preset-contract.ts'
import { isDirty, type PresetsController } from './presets-state.ts'
import styles from './PresetsPage.module.css'

export interface PresetsPageProps { controller: PresetsController }
const titles = { create: '新建子智能体', copy: '复制子智能体', edit: '编辑子智能体', repair: '原文修复' }
const labels: Record<PresetKey | 'body' | 'source', string> = { name: '内部名称', display_name: '显示名', description: '职责描述', model: '模型', thinking: '思考强度', deep: '深度', background: '后台运行', maxRounds: '轮数上限', body: '系统提示词', source: '完整 Markdown 原文' }

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
      <label className={styles.label} htmlFor={fieldId(key)}>{labels[key]}</label>
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
  const summaryField = failure?.field && failure.field in labels ? (raw && failure.field !== 'source' ? 'source' : failure.field) : undefined

  const catalogGroups: readonly ModelProviderGroup[] = state.catalog?.groups ?? []
  const defaultModelSelection = state.catalog?.default
  const defaultModelLabel = defaultModelSelection ? `继承默认 (${defaultModelSelection.provider}/${defaultModelSelection.model})` : '继承默认'
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
  let thinkingHint = '留空继承当前部署的思考设置。'
  let thinkingDisabled = false

  if (effectiveModelObj) {
    const reasoning = effectiveModelObj.reasoning
    if (reasoning?.efforts && reasoning.efforts.length > 0) {
      const defaultEffortNote = reasoning.defaultEffort ? ` (${reasoning.defaultEffort})` : ''
      thinkingOptions = [
        ['', `继承默认${defaultEffortNote}`],
        ...reasoning.efforts.map(e => [
          e.id,
          e.name && e.name.toLowerCase() !== e.id.toLowerCase() ? `${e.name} (${e.id})` : e.id,
        ] as [string, string]),
      ]
      if (draft?.fields.thinking && !thinkingOptions.some(([val]) => val === draft.fields.thinking)) {
        thinkingOptions.push([draft.fields.thinking, `${draft.fields.thinking} (未在列表中)`])
      }
      thinkingHint = `留空继承当前部署的思考设置。当前模型可用：${reasoning.efforts.map(e => e.id).join(' / ')}。`
    } else {
      thinkingOptions = [['', '不支持思考强度（继承/关闭）']]
      if (draft?.fields.thinking) {
        thinkingOptions.push([draft.fields.thinking, `${draft.fields.thinking} (该模型不支持)`])
      }
      thinkingHint = `当前模型（${effectiveModelObj.name}）不支持思考强度设置。`
      thinkingDisabled = true
    }
  } else {
    const fallbackLevels = ['off', 'low', 'medium', 'high', 'xhigh', 'max']
    thinkingOptions = [
      ['', '继承当前部署的思考设置'],
      ...fallbackLevels.map(l => [l, l] as [string, string]),
    ]
    if (draft?.fields.thinking && !thinkingOptions.some(([val]) => val === draft.fields.thinking)) {
      thinkingOptions.push([draft.fields.thinking, draft.fields.thinking])
    }
    if (state.catalogStatus === 'loading') {
      thinkingHint = '正在加载可用思考强度…'
    } else if (currentModel !== '') {
      thinkingHint = '未在模型目录中找到该模型，提供标准思考强度选项。'
    }
  }

  return <section className={styles.page} data-view={draft?.mode ?? 'list'} aria-busy={busy || state.status === 'loading'}>
    <div className={styles.content}>
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          {draft && <Button type="button" className={styles.action} variant="ghost" disabled={busy} onClick={() => controller.discard('list')}>返回列表</Button>}
          <h1 ref={heading} tabIndex={-1} className={styles.title}>{draft ? titles[draft.mode] : '子智能体'}</h1>
          {draft?.mode === 'copy' && <p className={styles.hint}>复制自 {draft.original?.id}.md，保存为新文件。</p>}
        </div>
        <div className={styles.actions}>
          <Button type="button" className={styles.action} variant="outline" disabled={busy || state.status === 'loading'} onClick={() => controller.discard('refresh')}>{state.status === 'loading' ? '正在刷新…' : '刷新'}</Button>
          {!draft && <Button type="button" className={styles.action} variant="primary" disabled={busy || state.status !== 'ready'} onClick={() => controller.start('create')}>新建子智能体</Button>}
        </div>
      </header>
      <div className={styles.directory}>
        <div className={styles.directoryHeader}>
          <FolderIcon className={styles.directoryIcon} />
          {state.list && <p className={styles.directoryPath}>目录：{state.list.directory}</p>}
        </div>
        <p className={styles.hint}>指向此目录的 profile 共享预设。修改将用于后续调用，已运行的任务保持原提示词。</p>
      </div>
      {failure && <div ref={errorSummary} tabIndex={-1} role="alert" className={styles.errorSummary}>
        <p className={styles.errorTitle}>{state.failure ? '操作未完成' : '读取失败'}</p>
        <p className={styles.errorText}>{failure.error}</p>
        {draft && summaryField && <a className={styles.errorLink} href={`#${fieldId(summaryField)}`} onClick={event => { event.preventDefault(); document.getElementById(fieldId(summaryField))?.focus() }}>检查{labels[summaryField as keyof typeof labels]}</a>}
        {draft && failure.code === 'source_required' && draft.mode === 'edit' && <Button type="button" className={styles.action} onClick={() => controller.discard('repair')}>转到原文修复</Button>}
      </div>}
      {state.notice && <p className={styles.notice} role="status">{state.notice}</p>}
      {!draft ? <>
        {state.status === 'loading' && <p className={styles.status} role="status">正在读取预设目录…</p>}
        {state.status === 'error' && <p className={styles.hint}>未能读取最新目录。请检查上方错误后刷新{state.list ? '；下方保留上次读取的列表。' : '。'}</p>}
        {state.status === 'ready' && state.list?.entries.length === 0 && (
          <div className={styles.empty}>
            <EmptyIcon className={styles.emptyIcon} />
            <h2 className={styles.emptyTitle}>此目录暂无子智能体</h2>
            <p className={styles.hint}>创建一个子智能体，填写它的职责和系统提示词。</p>
            <Button type="button" className={styles.action} variant="primary" onClick={() => controller.start('create')}>新建子智能体</Button>
          </div>
        )}
        <div className={styles.list}>
          {state.list?.entries.map(entry => {
            const displayName = entry.fields.display_name || entry.id
            const isThinkingActive = Boolean(entry.fields.thinking && entry.fields.thinking !== 'off')
            const thinkingValue = entry.fields.thinking || '继承默认'
            const modelValue = entry.fields.model || '继承默认'

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
                          {entry.error ? '文件错误' : entry.structured ? '可用' : '原文编辑'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`${styles.rowActions} ${styles.cardActions}`}>
                    <Button
                      type="button"
                      className={styles.action}
                      variant="outline"
                      aria-label={`${entry.error ? '修复' : '编辑'} ${entry.id}`}
                      disabled={busy || state.status !== 'ready'}
                      onClick={() => controller.start(entry.error || !entry.structured ? 'repair' : 'edit', entry)}
                    >
                      {entry.error ? '原文修复' : entry.structured ? '编辑' : '原文编辑'}
                    </Button>
                    {!entry.error && entry.structured && (
                      <Button
                        type="button"
                        className={styles.action}
                        variant="outline"
                        aria-label={`复制 ${entry.id}`}
                        disabled={busy || state.status !== 'ready'}
                        onClick={() => controller.start('copy', entry)}
                      >
                        复制
                      </Button>
                    )}
                    <Button
                      type="button"
                      className={`${styles.action} ${styles.danger}`}
                      aria-label={`删除 ${entry.id}.md`}
                      disabled={busy || state.status !== 'ready'}
                      onClick={() => controller.askDelete(entry)}
                    >
                      删除
                    </Button>
                  </div>
                </div>

                <div className={`${styles.rowContent} ${styles.cardBody}`}>
                  {entry.error ? (
                    <div className={styles.cardErrorBox} role="alert">
                      <div className={styles.cardErrorHeader}>
                        <WarningIcon />
                        <span>配置解析异常</span>
                      </div>
                      <p className={`${styles.errorText} ${styles.cardErrorText}`}>{entry.error}</p>
                    </div>
                  ) : (
                    <>
                      <p className={styles.description} data-empty={!entry.fields.description}>
                        {entry.fields.description || '未填写职责描述'}
                      </p>
                      {!entry.structured && (
                        <p className={styles.unstructuredNotice}>
                          此文件需要通过原文编辑保留结构。
                        </p>
                      )}
                    </>
                  )}
                </div>

                {!entry.error && (
                  <div className={styles.cardMeta}>
                    <span className={styles.metaChip} data-kind="model" title={`模型路由：${modelValue}`}>
                      <ModelIcon className={styles.chipIcon} />
                      <span className={styles.chipLabel}>模型：</span>
                      <span className={styles.chipValue}>{modelValue}</span>
                    </span>

                    <span
                      className={styles.metaChip}
                      data-kind="thinking"
                      data-active={isThinkingActive ? 'true' : 'false'}
                      data-level={entry.fields.thinking || 'default'}
                      title={`思考强度：${thinkingValue}`}
                    >
                      <ThinkingIcon className={styles.chipIcon} />
                      <span className={styles.chipLabel}>思考强度：</span>
                      <span className={styles.chipValue}>{thinkingValue}</span>
                    </span>

                    {entry.fields.background && (
                      <span
                        className={styles.metaChip}
                        data-kind="background"
                        title={entry.fields.background === 'true' ? '后台可持续会话' : '前台一次性运行'}
                      >
                        <BackgroundIcon className={styles.chipIcon} />
                        <span className={styles.chipValue}>
                          {entry.fields.background === 'true' ? '后台可持续' : '前台运行'}
                        </span>
                      </span>
                    )}

                    {entry.fields.deep !== undefined && entry.fields.deep !== '' && (
                      <span
                        className={styles.metaChip}
                        data-kind="deep"
                        title={entry.fields.deep === '0' ? '叶子节点：禁止派发子代理' : `派发深度：${entry.fields.deep}`}
                      >
                        <DeepIcon className={styles.chipIcon} />
                        <span className={styles.chipValue}>
                          {entry.fields.deep === '0' ? '叶子(禁派发)' : `深度：${entry.fields.deep}`}
                        </span>
                      </span>
                    )}

                    {entry.fields.maxRounds && (
                      <span
                        className={styles.metaChip}
                        data-kind="rounds"
                        title={`单次会话轮数上限：${entry.fields.maxRounds} 轮`}
                      >
                        <RoundsIcon className={styles.chipIcon} />
                        <span className={styles.chipValue}>上限 {entry.fields.maxRounds} 轮</span>
                      </span>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </> : <form className={styles.form} onSubmit={event => { event.preventDefault(); void controller.save() }}>
        {input('name', editable ? '新文件名等于内部名称；使用安全且唯一的名称。' : '内部名称固定为当前文件标识，不能通过编辑或修复改名。', { readOnly: !editable, required: true })}
        {raw ? <>
          {draft.original?.error && <div className={styles.diagnostic}><p className={styles.errorTitle}>原文件诊断</p><p className={styles.errorText}>{draft.original.error}</p></div>}
          {field('source', `包含 frontmatter 和系统提示词。将 name 纠正为 ${draft.original!.id}；保存时按同一规则校验。`, <textarea {...common('source')} className={`${styles.control} ${styles.source}`} value={draft.source} spellCheck={false} onChange={event => controller.text('source', event.target.value)} />)}
        </> : <>
          {input('display_name', '可留空，使用内部名称作为显示标签。变更已有显示名时会提示历史任务影响。')}
          {input('description', '一行职责描述，用于帮助选择合适的子智能体。')}
          {customModelMode ? field('model', '填写自定义 provider/model 路由（例如 openai/gpt-6.1-sol）或留空继承默认。',
            <Input {...common('model')} className={styles.input} placeholder="例如：openai/gpt-6.1-sol" value={currentModel} onChange={event => onModelChange(event.target.value)} />,
            <button type="button" className={styles.toggleCustom} onClick={() => setCustomModelMode(false)}>从列表选择</button>
          ) : field('model', '从当前部署已启用的模型中选择；留空继承默认设置。',
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
                <optgroup label="当前设置 / 未在目录中">
                  <option value={currentModel}>{currentModel}</option>
                </optgroup>
              )}
              <option value="__custom__">自定义输入…</option>
            </select>,
            <button type="button" className={styles.toggleCustom} onClick={() => setCustomModelMode(true)}>自定义输入</button>
          )}
          {state.catalogStatus === 'loading' && <p className={styles.hint} role="status">正在加载模型目录…</p>}
          {state.catalogError && <div className={styles.catalogError} role="status"><p className={styles.errorText}>模型目录加载失败：{state.catalogError}</p><p className={styles.hint}>当前模型值仍保留，可继续使用自定义路由。</p><Button type="button" className={styles.action} disabled={busy || state.catalogStatus === 'loading'} onClick={() => { void controller.loadModels() }}>重试模型目录</Button></div>}
          {state.catalog?.failures.map(item => <p className={styles.errorText} key={item.id}>模型目录 {item.name}：{item.message}</p>)}
          {select('thinking', thinkingHint, thinkingOptions, thinkingDisabled)}
          {field('body', '作为系统提示词原样使用，支持 Markdown。', <textarea {...common('body')} className={`${styles.control} ${styles.body}`} value={draft.body} onChange={event => controller.text('body', event.target.value)} />)}
          <details className={styles.advanced} open={draft.advanced} onToggle={event => controller.advanced(event.currentTarget.open)}>
            <summary className={styles.advancedToggle}>高级设置</summary>
            <div className={styles.advancedFields}>
              {input('deep', '留空沿用缺省深度 1；0 禁止此角色继续派发子代理。', { type: 'number', min: 0, step: 1, placeholder: '继承（1）' })}
              {select('background', '留空沿用缺省前台；true 为后台可持续会话。', [['', '继承（前台）'], ['false', 'false（前台）'], ['true', 'true（后台）']])}
              {input('maxRounds', '留空继承全局轮数上限；填写正整数。', { type: 'number', min: 1, step: 1, placeholder: '继承全局' })}
            </div>
          </details>
        </>}
        <footer className={styles.formFooter}>
          <p className={styles.hint} role="status">{busy ? '正在保存…' : isDirty(draft) ? '有未保存的修改' : '尚未修改'}</p>
          <div className={styles.actions}>
            <Button type="button" className={styles.action} variant="outline" disabled={busy} onClick={() => controller.discard('list')}>取消</Button>
            <Button type="submit" className={styles.action} variant="primary" disabled={busy || (!editable && !isDirty(draft))}>{busy ? '正在保存…' : '保存预设'}</Button>
          </div>
        </footer>
      </form>}
    </div>
    <Modal open={Boolean(confirmation)} onClose={() => controller.cancelConfirmation()} title={confirmation?.kind === 'delete' ? `删除 ${confirmation.entry.id}.md？` : confirmation?.kind === 'display' ? '确认显示名变更' : '放弃未保存的修改？'} closeLabel="取消确认" footer={<div className={styles.actions}><Button type="button" className={styles.action} data-modal-autofocus disabled={busy} onClick={() => controller.cancelConfirmation()}>取消</Button><Button type="button" className={styles.action} variant="primary" disabled={busy} onClick={() => { void controller.confirm() }}>{confirmation?.kind === 'delete' ? '确认删除' : confirmation?.kind === 'display' ? '确认并保存' : '放弃修改'}</Button></div>}>
      <p className={styles.confirmText}>{confirmation?.kind === 'delete' ? `将删除 ${confirmation.entry.id}.md。所有指向此目录的 profile 都将失去此预设；删除后无法从本页恢复。` : confirmation?.kind === 'display' ? '显示名新增、清除或变更会改变查找历史任务时使用的显示标签。旧任务可能无法再按 name 续跑或追问，历史记录不会迁移。' : confirmation?.kind === 'discard' && confirmation.action === 'refresh' ? '刷新将丢弃当前输入并重新读取目录。' : confirmation?.kind === 'discard' && confirmation.action === 'repair' ? '将丢弃当前表单输入，并打开读取时的完整原文。' : '返回列表将丢弃当前输入。'}</p>
      {confirmation?.kind === 'delete' && <p className={styles.directoryPath}>目录：{state.list?.directory}</p>}
      {confirmation?.kind === 'display' && <p className={styles.directoryPath}>目标：{confirmation.request.id}.md</p>}
    </Modal>
  </section>
}
