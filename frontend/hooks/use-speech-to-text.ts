'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Thin wrapper over the browser's SpeechRecognition API (Web Speech API).
 * Not available in every browser (notably older Firefox) — check
 * `isSupported` before treating the mic button as usable.
 */
export function useSpeechToText(onTranscript: (fullText: string) => void) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const baseTextRef = useRef('')
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  useEffect(() => {
    const Ctor =
      typeof window !== 'undefined' &&
      ((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)
    setIsSupported(!!Ctor)
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback((baseText: string) => {
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition
    if (!Ctor) return

    baseTextRef.current = baseText
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new (Ctor as any)()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      const base = baseTextRef.current
      onTranscriptRef.current(base ? `${base} ${transcript}` : transcript)
    }
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [])

  const toggle = useCallback(
    (baseText: string) => {
      if (isListening) stop()
      else start(baseText)
    },
    [isListening, start, stop]
  )

  // Stop the mic if the component using this hook unmounts mid-recording.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  return { isListening, isSupported, toggle }
}
