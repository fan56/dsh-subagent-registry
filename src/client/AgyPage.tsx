import { useEffect, useSyncExternalStore } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AgyController } from './agy-state.ts'
import { agyStringsFor, type AgyStrings } from './strings.ts'
import styles from './AgyPage.module.css'

export interface AgyPageProps { controller: AgyController }

/** Catalog `createdAt` is real on web; render it as a coarse relative age. */
function createdAgo(createdAt: number, now: number, t: AgyStrings): string {
  const minutes = Math.max(0, Math.floor((now - createdAt) / 60_000))
  if (minutes < 1) return t.justNow
  if (minutes < 60) return t.agoMinutes(minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t.agoHours(hours)
  return t.agoDays(Math.floor(hours / 24))
}

export function AgyPage({ controller }: AgyPageProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const t = agyStringsFor(state.language)
  useEffect(() => {
    controller.open()
    return () => controller.close()
  }, [controller])
  const now = Date.now()
  const loading = state.status === 'loading'

  return <section className={styles.page} aria-busy={loading}>
    <div className={styles.content}>
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
        </div>
        <Button type="button" className={styles.action} variant="outline" disabled={loading} onClick={() => controller.refresh()}>{loading ? t.refreshing : t.refresh}</Button>
      </header>
      {state.notice && <p className={styles.notice} role="status">{state.notice}</p>}
      {state.error && <p className={styles.error} role="alert">{state.error}</p>}
      {state.rows.length === 0
        ? <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>{t.emptyTitle}</h2>
          <p className={styles.hint}>{t.emptyHint}</p>
        </div>
        : <div className={styles.list}>
          {state.rows.map(row => <article key={row.id} className={styles.card} data-status={row.outcome}>
            <div className={styles.identity}>
              <div className={styles.avatar} aria-hidden="true">{row.label.trim().slice(0, 1).toUpperCase() || '?'}</div>
              <div className={styles.meta}>
                <div className={styles.rowHeading}>
                  <h2 className={styles.rowTitle}>{row.label}</h2>
                  <span
                    className={styles.badge}
                    data-status={row.outcome}
                  >
                    <span className={styles.dot} aria-hidden="true" />
                    {t.outcome[row.outcome]}
                  </span>
                </div>
                <span className={styles.identifier}>{row.id}</span>
                <span className={styles.hint}>{createdAgo(row.createdAt, now, t)}</span>
              </div>
            </div>
            {row.outcome === 'running' && <div className={styles.actions}>
              <Button
                type="button"
                className={`${styles.action} ${styles.danger}`}
                variant="outline"
                aria-label={t.stopAria(row.label)}
                disabled={Boolean(state.busy[row.id])}
                onClick={() => { void controller.stop(row.id) }}
              >
                {state.busy[row.id] ? t.stopping : t.stop}
              </Button>
            </div>}
          </article>)}
        </div>}
    </div>
  </section>
}
