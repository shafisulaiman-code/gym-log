import { useEffect, useRef, useState } from 'react'
import BottomSheet from '../components/BottomSheet'
import { buildExportFile, copyText, shareOrDownload } from '../export'

type Props = { open: boolean; onClose: () => void }

export default function ExportSheet({ open, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle')
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setCopied('idle')
    buildExportFile().then(async (f) => {
      setFile(f)
      setText(await f.text())
    })
  }, [open])

  if (!open) return null

  async function copy() {
    const ok = await copyText(text)
    setCopied(ok ? 'ok' : 'failed')
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Export JSON">
      {file ? (
        <p className="muted" style={{ margin: '0 0 14px' }}>
          {file.name} · {(file.size / 1024).toFixed(1)} KB
        </p>
      ) : (
        <p className="muted">Preparing…</p>
      )}

      <div className="two-up" style={{ marginTop: 0 }}>
        <button type="button" className="btn secondary" disabled={!file} onClick={() => file && shareOrDownload(file)}>
          Share or download
        </button>
        <button type="button" className="btn primary" disabled={!file} onClick={copy}>
          {copied === 'ok' ? 'Copied' : 'Copy JSON'}
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
