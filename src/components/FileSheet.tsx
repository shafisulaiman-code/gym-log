import { useEffect, useRef, useState, type ReactNode } from 'react'
import BottomSheet from './BottomSheet'
import { copyText, shareOrDownload } from '../export'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  copyLabel: string
  build: () => Promise<File>
  children?: ReactNode // sits above the file line
}

// A sheet that builds one file, shows its name and size, and offers share,
// copy, and a select-by-hand textarea when the clipboard is blocked.
export default function FileSheet({ open, onClose, title, copyLabel, build, children }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle')
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    let stale = false
    setCopied('idle')
    setFile(null)
    build().then(async (f) => {
      const t = await f.text()
      if (stale) return
      setFile(f)
      setText(t)
    })
    return () => {
      stale = true
    }
  }, [open, build])

  if (!open) return null

  async function copy() {
    const ok = await copyText(text)
    setCopied(ok ? 'ok' : 'failed')
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {children}

      {file ? (
        <p className="muted" style={{ margin: '0 0 14px' }}>
          {file.name} · {(file.size / 1024).toFixed(1)} KB
        </p>
      ) : (
        <p className="muted" style={{ margin: '0 0 14px' }}>
          Preparing…
        </p>
      )}

      <div className="two-up" style={{ marginTop: 0 }}>
        <button type="button" className="btn secondary" disabled={!file} onClick={() => file && shareOrDownload(file)}>
          Share or download
        </button>
        <button type="button" className="btn primary" disabled={!file} onClick={copy}>
          {copied === 'ok' ? 'Copied' : copyLabel}
        </button>
      </div>

      {copied === 'failed' && (
        <>
          <p className="muted" style={{ margin: '14px 0 0' }}>
            Copying is blocked on this connection. Select the text below and copy it by hand.
          </p>
          <textarea ref={area} className="export-text" readOnly value={text} rows={8} />
          <button
            type="button"
            className="btn quiet wide"
            onClick={() => {
              area.current?.focus()
              area.current?.select()
            }}
          >
            Select all
          </button>
        </>
      )}
    </BottomSheet>
  )
}
