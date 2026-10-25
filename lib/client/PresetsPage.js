import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { isDirty } from "./presets-state.js";
import styles from './PresetsPage.module.css';
const titles = { create: 'Новый суб-агент', copy: 'Копировать суб-агента', edit: 'Редактировать суб-агента', repair: 'Ремонт исходника' };
const labels = { name: 'Внутреннее имя', display_name: 'Отображаемое имя', description: 'Описание обязанностей', model: 'Модель', thinking: 'Уровень thinking', deep: 'Глубина', background: 'Фоновый запуск', maxRounds: 'Лимит раундов', body: 'Системная подсказка', source: 'Полный исходный Markdown' };
function WarningIcon({ className }) {
    return (<svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>);
}
function FolderIcon({ className }) {
    return (<svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
    </svg>);
}
function ModelIcon({ className }) {
    return (<svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
      <rect x="9" y="9" width="6" height="6"/>
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>
    </svg>);
}
function ThinkingIcon({ className }) {
    return (<svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
      <path d="M9 18h6"/>
      <path d="M10 22h4"/>
    </svg>);
}
function BackgroundIcon({ className }) {
    return (<svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>);
}
function DeepIcon({ className }) {
    return (<svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="3"/>
      <circle cx="6" cy="18" r="3"/>
      <circle cx="18" cy="9" r="3"/>
      <path d="M6 9v6"/>
      <path d="M9 9h3a3 3 0 0 1 3 3v-3"/>
    </svg>);
}
function RoundsIcon({ className }) {
    return (<svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m17 2 4 4-4 4"/>
      <path d="M3 11v-1a4 4 0 0 1 4-4h14"/>
      <path d="m7 22-4-4 4-4"/>
      <path d="M21 13v1a4 4 0 0 1-4 4H3"/>
    </svg>);
}
function EmptyIcon({ className }) {
    return (<svg className={className} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <circle cx="12" cy="5" r="2"/>
      <path d="M12 7v4"/>
      <line x1="8" y1="16" x2="8.01" y2="16"/>
      <line x1="16" y1="16" x2="16.01" y2="16"/>
    </svg>);
}
function AgentAvatar({ name, isError }) {
    if (isError) {
        return (<div className={`${styles.avatar} ${styles.avatarError}`} aria-hidden="true">
        <WarningIcon className={styles.avatarIcon}/>
      </div>);
    }
    const initial = name.trim().slice(0, 1).toUpperCase();
    return (<div className={styles.avatar} aria-hidden="true">
      {initial || '?'}
    </div>);
}
export function PresetsPage({ controller }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const { draft, confirmation, busy } = state;
    const issue = state.failure ?? state.listError;
    const failure = issue?.field === 'id' ? { ...issue, field: 'name' } : issue;
    const prefix = useId();
    const heading = useRef(null);
    const errorSummary = useRef(null);
    const [customModelMode, setCustomModelMode] = useState(false);
    const view = draft ? `${draft.mode}:${draft.original?.id ?? ''}` : 'list';
    useEffect(() => { controller.open(); }, [controller]);
    useEffect(() => { heading.current?.focus(); }, [view]);
    useEffect(() => { setCustomModelMode(false); }, [view]);
    useEffect(() => {
        if (failure) {
            if (['deep', 'background', 'maxRounds'].includes(failure.field ?? ''))
                controller.advanced(true);
            errorSummary.current?.focus();
        }
    }, [controller, failure]);
    const fieldId = (key) => `${prefix}-${key}`;
    const fieldError = (key) => failure?.field === key ? failure.error : undefined;
    const common = (key) => ({ id: fieldId(key), disabled: busy, 'aria-invalid': Boolean(fieldError(key)), 'aria-describedby': `${fieldId(key)}-hint${fieldError(key) ? ` ${fieldId(key)}-error` : ''}` });
    const field = (key, hint, control, extraHeader) => <div className={styles.field} data-state={fieldError(key) ? 'error' : busy ? 'disabled' : undefined}>
    <div className={styles.fieldHeader}>
      <label className={styles.label} htmlFor={fieldId(key)}>{labels[key]}</label>
      {extraHeader}
    </div>
    {control}
    <p className={styles.hint} id={`${fieldId(key)}-hint`}>{hint}</p>
    {fieldError(key) && <p className={styles.fieldError} id={`${fieldId(key)}-error`}>{fieldError(key)}</p>}
  </div>;
    const input = (key, hint, extra = {}) => field(key, hint, <Input {...common(key)} {...extra} className={styles.input} value={draft?.fields[key] ?? ''} onChange={event => controller.field(key, event.target.value)}/>);
    const select = (key, hint, options, disabled = false) => field(key, hint, <select {...common(key)} disabled={disabled || busy} className={styles.control} value={draft?.fields[key] ?? ''} onChange={event => controller.field(key, event.target.value)}>
      {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>);
    const editable = draft?.mode === 'create' || draft?.mode === 'copy';
    const raw = draft?.mode === 'repair';
    const summaryField = failure?.field && failure.field in labels ? (raw && failure.field !== 'source' ? 'source' : failure.field) : undefined;
    const catalogGroups = state.catalog?.groups ?? [];
    const defaultModelSelection = state.catalog?.default;
    const defaultModelLabel = defaultModelSelection ? `Наследовать (${defaultModelSelection.provider}/${defaultModelSelection.model})` : 'Наследовать по умолчанию';
    const currentModel = draft?.fields[key_of('model')] ?? '';
    function key_of(k) { return k; }
    const isModelInCatalog = currentModel === '' || catalogGroups.some(g => g.models.some(m => `${g.id}/${m.id}` === currentModel));
    const onModelChange = (nextModel) => {
        controller.field('model', nextModel);
        const effectiveRoute = nextModel || (defaultModelSelection ? `${defaultModelSelection.provider}/${defaultModelSelection.model}` : '');
        let targetModelObj;
        for (const group of catalogGroups) {
            for (const m of group.models) {
                if (`${group.id}/${m.id}` === effectiveRoute) {
                    targetModelObj = m;
                    break;
                }
            }
            if (targetModelObj)
                break;
        }
        if (targetModelObj) {
            const efforts = targetModelObj.reasoning?.efforts ?? [];
            if (efforts.length === 0) {
                if (draft?.fields.thinking)
                    controller.field('thinking', '');
            }
            else if (draft?.fields.thinking && !efforts.some(e => e.id === draft.fields.thinking)) {
                controller.field('thinking', '');
            }
        }
    };
    const effectiveModelRoute = currentModel || (defaultModelSelection ? `${defaultModelSelection.provider}/${defaultModelSelection.model}` : '');
    let effectiveModelObj;
    for (const group of catalogGroups) {
        for (const m of group.models) {
            if (`${group.id}/${m.id}` === effectiveModelRoute) {
                effectiveModelObj = m;
                break;
            }
        }
        if (effectiveModelObj)
            break;
    }
    let thinkingOptions = [];
    let thinkingHint = 'Оставьте пустым, чтобы унаследовать настройки thinking текущего развёртывания.';
    let thinkingDisabled = false;
    if (effectiveModelObj) {
        const reasoning = effectiveModelObj.reasoning;
        if (reasoning?.efforts && reasoning.efforts.length > 0) {
            const defaultEffortNote = reasoning.defaultEffort ? ` (${reasoning.defaultEffort})` : '';
            thinkingOptions = [
                ['', `Наследовать по умолчанию${defaultEffortNote}`],
                ...reasoning.efforts.map(e => [
                    e.id,
                    e.name && e.name.toLowerCase() !== e.id.toLowerCase() ? `${e.name} (${e.id})` : e.id,
                ]),
            ];
            if (draft?.fields.thinking && !thinkingOptions.some(([val]) => val === draft.fields.thinking)) {
                thinkingOptions.push([draft.fields.thinking, `${draft.fields.thinking} (нет в списке)`]);
            }
            thinkingHint = `Оставьте пустым, чтобы унаследовать настройки thinking текущего развёртывания.Доступно для текущей модели: ${reasoning.efforts.map(e => e.id).join(' / ')}.`;
        }
        else {
            thinkingOptions = [['', 'Не поддерживает уровни thinking (наследование/выкл.)']];
            if (draft?.fields.thinking) {
                thinkingOptions.push([draft.fields.thinking, `${draft.fields.thinking} (модель не поддерживает)`]);
            }
            thinkingHint = `Модель (${effectiveModelObj.name}) не поддерживает настройку уровней thinking.`;
            thinkingDisabled = true;
        }
    }
    else {
        const fallbackLevels = ['off', 'low', 'medium', 'high', 'xhigh', 'max'];
        thinkingOptions = [
            ['', 'Наследовать настройки thinking текущего развёртывания'],
            ...fallbackLevels.map(l => [l, l]),
        ];
        if (draft?.fields.thinking && !thinkingOptions.some(([val]) => val === draft.fields.thinking)) {
            thinkingOptions.push([draft.fields.thinking, draft.fields.thinking]);
        }
        if (state.catalogStatus === 'loading') {
            thinkingHint = 'Загрузка доступных уровней thinking…';
        }
        else if (currentModel !== '') {
            thinkingHint = 'Модель не найдена в каталоге моделей; предлагаются стандартные уровни thinking.';
        }
    }
    return <section className={styles.page} data-view={draft?.mode ?? 'list'} aria-busy={busy || state.status === 'loading'}>
    <div className={styles.content}>
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          {draft && <Button type="button" className={styles.action} variant="ghost" disabled={busy} onClick={() => controller.discard('list')}>К списку</Button>}
          <h1 ref={heading} tabIndex={-1} className={styles.title}>{draft ? titles[draft.mode] : 'Суб-агенты'}</h1>
          {draft?.mode === 'copy' && <p className={styles.hint}>Скопировано из {draft.original?.id}.md — сохраняется как новый файл.</p>}
        </div>
        <div className={styles.actions}>
          <Button type="button" className={styles.action} variant="outline" disabled={busy || state.status === 'loading'} onClick={() => controller.discard('refresh')}>{state.status === 'loading' ? 'Обновление…' : 'Обновить'}</Button>
          {!draft && <Button type="button" className={styles.action} variant="primary" disabled={busy || state.status !== 'ready'} onClick={() => controller.start('create')}>Новый суб-агент</Button>}
        </div>
      </header>
      <div className={styles.directory}>
        <div className={styles.directoryHeader}>
          <FolderIcon className={styles.directoryIcon}/>
          {state.list && <p className={styles.directoryPath}>Каталог: {state.list.directory}</p>}
        </div>
        <p className={styles.hint}>Профили, указывающие на этот каталог, разделяют пресеты. Изменения будут применяться к последующим вызовам; уже запущенные задачи сохраняют исходную подсказку.</p>
      </div>
      {failure && <div ref={errorSummary} tabIndex={-1} role="alert" className={styles.errorSummary}>
        <p className={styles.errorTitle}>{state.failure ? 'Операция не завершена' : 'Ошибка чтения'}</p>
        <p className={styles.errorText}>{failure.error}</p>
        {draft && summaryField && <a className={styles.errorLink} href={`#${fieldId(summaryField)}`} onClick={event => { event.preventDefault(); document.getElementById(fieldId(summaryField))?.focus(); }}>Проверить {labels[summaryField]}</a>}
        {draft && failure.code === 'source_required' && draft.mode === 'edit' && <Button type="button" className={styles.action} onClick={() => controller.discard('repair')}>Перейти к ремонту исходника</Button>}
      </div>}
      {state.notice && <p className={styles.notice} role="status">{state.notice}</p>}
      {!draft ? <>
        {state.status === 'loading' && <p className={styles.status} role="status">Чтение каталога пресетов…</p>}
        {state.status === 'error' && <p className={styles.hint}>Не удалось прочитать актуальный каталог; проверьте ошибку выше и обновите{state.list ? '; ниже сохранён список прошлого чтения.' : '.'}</p>}
        {state.status === 'ready' && state.list?.entries.length === 0 && (<div className={styles.empty}>
            <EmptyIcon className={styles.emptyIcon}/>
            <h2 className={styles.emptyTitle}>В этом каталоге пока нет суб-агентов</h2>
            <p className={styles.hint}>Создайте суб-агента и укажите его обязанности и системную подсказку.</p>
            <Button type="button" className={styles.action} variant="primary" onClick={() => controller.start('create')}>Новый суб-агент</Button>
          </div>)}
        <div className={styles.list}>
          {state.list?.entries.map(entry => {
                const displayName = entry.fields.display_name || entry.id;
                const isThinkingActive = Boolean(entry.fields.thinking && entry.fields.thinking !== 'off');
                const thinkingValue = entry.fields.thinking || 'Наследовать по умолчанию';
                const modelValue = entry.fields.model || 'Наследовать по умолчанию';
                return (<article key={entry.id} className={`${styles.card} ${styles.row}`} data-state={entry.error ? 'error' : 'ready'}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardIdentity}>
                    <AgentAvatar name={displayName} isError={Boolean(entry.error)}/>
                    <div className={styles.titleArea}>
                      <div className={`${styles.rowHeading} ${styles.titleRow}`}>
                        <h2 className={`${styles.rowTitle} ${styles.cardTitle}`}>{displayName}</h2>
                        <span className={`${styles.identifier} ${styles.filePill}`}>{`${entry.id}.md`}</span>
                        <span className={`${styles.badge} ${styles.statusBadge}`} data-status={entry.error ? 'error' : entry.structured ? 'ready' : 'unstructured'}>
                          <span className={styles.statusDot} aria-hidden="true"/>
                          {entry.error ? 'Ошибка файла' : entry.structured ? 'Готов' : 'Редактирование исходника'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`${styles.rowActions} ${styles.cardActions}`}>
                    <Button type="button" className={styles.action} variant="outline" aria-label={`${entry.error ? 'Ремонт' : 'Редактировать'} ${entry.id}`} disabled={busy || state.status !== 'ready'} onClick={() => controller.start(entry.error || !entry.structured ? 'repair' : 'edit', entry)}>
                      {entry.error ? 'Ремонт исходника' : entry.structured ? 'Редактировать' : 'Редактирование исходника'}
                    </Button>
                    {!entry.error && entry.structured && (<Button type="button" className={styles.action} variant="outline" aria-label={`Копировать ${entry.id}`} disabled={busy || state.status !== 'ready'} onClick={() => controller.start('copy', entry)}>
                        Копировать
                      </Button>)}
                    <Button type="button" className={`${styles.action} ${styles.danger}`} aria-label={`Удалить ${entry.id}.md`} disabled={busy || state.status !== 'ready'} onClick={() => controller.askDelete(entry)}>
                      Удалить
                    </Button>
                  </div>
                </div>

                <div className={`${styles.rowContent} ${styles.cardBody}`}>
                  {entry.error ? (<div className={styles.cardErrorBox} role="alert">
                      <div className={styles.cardErrorHeader}>
                        <WarningIcon />
                        <span>Ошибка разбора конфигурации</span>
                      </div>
                      <p className={`${styles.errorText} ${styles.cardErrorText}`}>{entry.error}</p>
                    </div>) : (<>
                      <p className={styles.description} data-empty={!entry.fields.description}>
                        {entry.fields.description || 'Описание не указано'}
                      </p>
                      {!entry.structured && (<p className={styles.unstructuredNotice}>
                          Чтобы сохранить структуру, этот файл нужно редактировать как исходник.
                        </p>)}
                    </>)}
                </div>

                {!entry.error && (<div className={styles.cardMeta}>
                    <span className={styles.metaChip} data-kind="model" title={`Маршрут модели: ${modelValue}`}>
                      <ModelIcon className={styles.chipIcon}/>
                      <span className={styles.chipLabel}>Модель: </span>
                      <span className={styles.chipValue}>{modelValue}</span>
                    </span>

                    <span className={styles.metaChip} data-kind="thinking" data-active={isThinkingActive ? 'true' : 'false'} data-level={entry.fields.thinking || 'default'} title={`Уровень thinking: ${thinkingValue}`}>
                      <ThinkingIcon className={styles.chipIcon}/>
                      <span className={styles.chipLabel}>Thinking: </span>
                      <span className={styles.chipValue}>{thinkingValue}</span>
                    </span>

                    {entry.fields.background && (<span className={styles.metaChip} data-kind="background" title={entry.fields.background === 'true' ? 'Непрерывная фоновая сессия' : 'Разовый запуск на переднем плане'}>
                        <BackgroundIcon className={styles.chipIcon}/>
                        <span className={styles.chipValue}>
                          {entry.fields.background === 'true' ? 'Фон, непрерывный' : 'Передний план'}
                        </span>
                      </span>)}

                    {entry.fields.deep !== undefined && entry.fields.deep !== '' && (<span className={styles.metaChip} data-kind="deep" title={entry.fields.deep === '0' ? 'Листовой узел: запуск суб-агентов запрещён' : `Глубина запуска: ${entry.fields.deep}`}>
                        <DeepIcon className={styles.chipIcon}/>
                        <span className={styles.chipValue}>
                          {entry.fields.deep === '0' ? 'Лист (без запуска)' : `Глубина: ${entry.fields.deep}`}
                        </span>
                      </span>)}

                    {entry.fields.maxRounds && (<span className={styles.metaChip} data-kind="rounds" title={`Лимит раундов одной сессии: ${entry.fields.maxRounds}`}>
                        <RoundsIcon className={styles.chipIcon}/>
                        <span className={styles.chipValue}>Лимит: {entry.fields.maxRounds}</span>
                      </span>)}
                  </div>)}
              </article>);
            })}
        </div>
      </> : <form className={styles.form} onSubmit={event => { event.preventDefault(); void controller.save(); }}>
        {input('name', editable ? 'Новое имя файла равно внутреннему имени; используйте безопасное уникальное имя.' : 'Внутреннее имя закреплено за идентификатором текущего файла; переименовать его редактированием или ремонтом нельзя.', { readOnly: !editable, required: true })}
        {raw ? <>
          {draft.original?.error && <div className={styles.diagnostic}><p className={styles.errorTitle}>Диагностика исходного файла</p><p className={styles.errorText}>{draft.original.error}</p></div>}
          {field('source', `Содержит frontmatter и Системная подсказка.name исправляется на ${draft.original.id}; при сохранении проверка по тем же правилам.`, <textarea {...common('source')} className={`${styles.control} ${styles.source}`} value={draft.source} spellCheck={false} onChange={event => controller.text('source', event.target.value)}/>)}
        </> : <>
          {input('display_name', 'Можно оставить пустым — в качестве метки используется внутреннее имя. При изменении существующего отображаемого имени появится предупреждение о влиянии на исторические задачи.')}
          {input('description', 'Однострочное описание обязанностей, помогающее выбрать подходящего суб-агента.')}
          {customModelMode ? field('model', 'Укажите собственный маршрут provider/model (например, openai/gpt-6.1-sol) или оставьте пустым, чтобы наследовать по умолчанию.', <Input {...common('model')} className={styles.input} placeholder="Например: openai/gpt-6.1-sol" value={currentModel} onChange={event => onModelChange(event.target.value)}/>, <button type="button" className={styles.toggleCustom} onClick={() => setCustomModelMode(false)}>Выбрать из списка</button>) : field('model', 'Выберите модель, включённую в текущем развёртывании', <select {...common('model')} className={styles.control} value={currentModel} onChange={event => {
                        const val = event.target.value;
                        if (val === '__custom__')
                            setCustomModelMode(true);
                        else
                            onModelChange(val);
                    }}>
              <option value="">{defaultModelLabel}</option>
              {catalogGroups.map(group => (<optgroup key={group.id} label={group.name}>
                  {group.models.map(m => (<option key={`${group.id}/${m.id}`} value={`${group.id}/${m.id}`}>
                      {m.name} ({group.id}/{m.id})
                    </option>))}
                </optgroup>))}
              {!isModelInCatalog && currentModel !== '' && (<optgroup label="Текущая настройка / нет в каталоге">
                  <option value={currentModel}>{currentModel}</option>
                </optgroup>)}
              <option value="__custom__">Свой вариант…</option>
            </select>, <button type="button" className={styles.toggleCustom} onClick={() => setCustomModelMode(true)}>Свой вариант</button>)}
          {state.catalogStatus === 'loading' && <p className={styles.hint} role="status">Загрузка каталога моделей…</p>}
          {state.catalogError && <div className={styles.catalogError} role="status"><p className={styles.errorText}>Не удалось загрузить каталог моделей: {state.catalogError}</p><p className={styles.hint}>Текущее значение модели сохранено; можно продолжать использовать собственный маршрут.</p><Button type="button" className={styles.action} disabled={busy || state.catalogStatus === 'loading'} onClick={() => { void controller.loadModels(); }}>Повторить загрузку каталога</Button></div>}
          {state.catalog?.failures.map(item => <p className={styles.errorText} key={item.id}>Каталог моделей {item.name}: {item.message}</p>)}
          {select('thinking', thinkingHint, thinkingOptions, thinkingDisabled)}
          {field('body', 'Используется дословно как системная подсказка; поддерживается Markdown.', <textarea {...common('body')} className={`${styles.control} ${styles.body}`} value={draft.body} onChange={event => controller.text('body', event.target.value)}/>)}
          <details className={styles.advanced} open={draft.advanced} onToggle={event => controller.advanced(event.currentTarget.open)}>
            <summary className={styles.advancedToggle}>Дополнительные настройки</summary>
            <div className={styles.advancedFields}>
              {input('deep', 'Оставьте пустым, чтобы применить глубину по умолчанию 1; 0 запрещает этому агенту запускать суб-агентов.', { type: 'number', min: 0, step: 1, placeholder: 'Наследовать (1)' })}
              {select('background', 'Оставьте пустым, чтобы применить передний план по умолчанию; true = непрерывная фоновая сессия.', [['', 'Наследовать (передний план)'], ['false', 'false (передний план)'], ['true', 'true (фон)']])}
              {input('maxRounds', 'Оставьте пустым, чтобы унаследовать глобальный лимит раундов; укажите положительное целое.', { type: 'number', min: 1, step: 1, placeholder: 'Унаследовать глобальный' })}
            </div>
          </details>
        </>}
        <footer className={styles.formFooter}>
          <p className={styles.hint} role="status">{busy ? 'Сохранение…' : isDirty(draft) ? 'Есть несохранённые изменения' : 'Изменений нет'}</p>
          <div className={styles.actions}>
            <Button type="button" className={styles.action} variant="outline" disabled={busy} onClick={() => controller.discard('list')}>Отмена</Button>
            <Button type="submit" className={styles.action} variant="primary" disabled={busy || (!editable && !isDirty(draft))}>{busy ? 'Сохранение…' : 'Сохранить пресет'}</Button>
          </div>
        </footer>
      </form>}
    </div>
    <Modal open={Boolean(confirmation)} onClose={() => controller.cancelConfirmation()} title={confirmation?.kind === 'delete' ? `Удалить ${confirmation.entry.id}.md?` : confirmation?.kind === 'display' ? 'Подтвердить изменение отображаемого имени' : 'Отменить несохранённые изменения?'} closeLabel="Отменить подтверждение" footer={<div className={styles.actions}><Button type="button" className={styles.action} data-modal-autofocus disabled={busy} onClick={() => controller.cancelConfirmation()}>Отмена</Button><Button type="button" className={styles.action} variant="primary" disabled={busy} onClick={() => { void controller.confirm(); }}>{confirmation?.kind === 'delete' ? 'Подтвердить удаление' : confirmation?.kind === 'display' ? 'Подтвердить и сохранить' : 'Отменить изменения'}</Button></div>}>
      <p className={styles.confirmText}>{confirmation?.kind === 'delete' ? `Будет удалён ${confirmation.entry.id}.md. Все профили, указывающие на этот каталог, потеряют этот пресет; после удаления восстановить со страницы нельзя.` : confirmation?.kind === 'display' ? 'Добавление, очистка или изменение отображаемого имени влияет на метку, по которой находятся исторические задачи. Старые задачи могут перестать продолжаться или уточняться по name; история не мигрирует.' : confirmation?.kind === 'discard' && confirmation.action === 'refresh' ? 'Обновление отбросит текущий ввод и перечитает каталог.' : confirmation?.kind === 'discard' && confirmation.action === 'repair' ? 'Текущий ввод формы будет отброшен, откроется полный исходник, считанный при чтении.' : 'Возврат к списку отбросит текущий ввод.'}</p>
      {confirmation?.kind === 'delete' && <p className={styles.directoryPath}>Каталог: {state.list?.directory}</p>}
      {confirmation?.kind === 'display' && <p className={styles.directoryPath}>Цель: {confirmation.request.id}.md</p>}
    </Modal>
  </section>;
}
//# sourceMappingURL=PresetsPage.js.map