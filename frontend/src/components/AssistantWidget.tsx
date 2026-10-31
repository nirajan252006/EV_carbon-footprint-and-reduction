import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, ExternalLink, LoaderCircle, MessageCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import type { AccountType, ChatResponse } from "../types/api";

type Exchange = {
  question: string;
  response: ChatResponse;
};

export function AssistantWidget({ accountType }: { accountType: AccountType }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (text.length < 3 || asking) return;

    setAsking(true);
    setError(null);
    try {
      const response = await api.chat(text);
      setExchanges((current) => [...current, { question: text, response }]);
      setQuestion("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The assistant could not answer.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Close knowledge assistant" : "Open knowledge assistant"}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#315C85] text-white shadow-[0_16px_38px_-12px_rgba(24,38,58,0.55)] transition hover:-translate-y-1 hover:bg-[#274d75] focus-visible:outline-offset-4 active:scale-95 sm:bottom-7 sm:right-7"
      >
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <MessageCircle className="h-5 w-5" aria-hidden="true" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.section
            key="assistant-widget"
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
            aria-label="Knowledge assistant"
            className="fixed bottom-24 right-4 z-50 flex h-[min(34rem,calc(100dvh-8rem))] w-[calc(100vw-2rem)] max-w-[25rem] flex-col overflow-hidden rounded-2xl border border-[#E4E6E8] bg-white shadow-[0_24px_70px_-24px_rgba(24,38,58,0.42)] sm:bottom-28 sm:right-7"
          >
            <header className="flex items-center gap-3 border-b border-[#E4E6E8] bg-[#F7F9FC] px-4 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EAF0F6] text-[#315C85]">
                <Bot className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-[#18263A]">GreenTrack assistant</h2>
                <p className="text-[11px] text-slate-500">Answers grounded in indexed guidance</p>
              </div>
              <Link
                to={`/${accountType}/assistant`}
                onClick={() => setOpen(false)}
                aria-label="Open full knowledge assistant"
                title="Open full assistant"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-[#315C85]"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Link>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Assistant conversation">
              {!exchanges.length && (
                <div className="rounded-xl border border-[#DCE6F5] bg-[#F5F8FC] p-3.5">
                  <p className="text-sm font-medium text-[#18263A]">Ask about sustainability guidance</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Answers use your workspace’s indexed documents and include source links. This assistant does not read or calculate your activity data.
                  </p>
                </div>
              )}
              {exchanges.map(({ question: asked, response }, index) => (
                <div key={`${index}-${asked}`} className="space-y-2.5">
                  <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-sm bg-[#315C85] px-3.5 py-2.5 text-sm leading-5 text-white">
                    {asked}
                  </p>
                  <article className={`max-w-[95%] rounded-2xl rounded-bl-sm border p-3.5 ${response.insufficient_evidence ? "border-amber-200 bg-amber-50" : "border-[#E4E6E8] bg-[#F7F9FC]"}`}>
                    <p className="whitespace-pre-wrap text-xs leading-5 text-slate-700">{response.answer}</p>
                    {!!response.sources.length && (
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-200 pt-2.5">
                        {response.sources.map((source) => (
                          source.source_url ? (
                            <a
                              key={`${source.id}-${source.document_id}`}
                              href={source.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-[#315C85] hover:border-[#315C85]"
                            >
                              [{source.id}] {source.filename}
                            </a>
                          ) : (
                            <span key={`${source.id}-${source.document_id}`} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500">
                              [{source.id}] {source.filename}
                            </span>
                          )
                        ))}
                      </div>
                    )}
                  </article>
                </div>
              ))}
              {asking && (
                <p className="flex items-center gap-2 text-xs text-slate-500" role="status">
                  <LoaderCircle className="h-4 w-4 animate-spin text-[#315C85]" aria-hidden="true" />
                  Retrieving evidence…
                </p>
              )}
              {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">{error}</p>}
            </div>

            <form onSubmit={ask} className="border-t border-[#E4E6E8] bg-white p-3">
              <div className="flex items-end gap-2 rounded-xl border border-[#E4E6E8] p-2 transition focus-within:border-[#315C85] focus-within:ring-4 focus-within:ring-[#EAF0F6]">
                <label htmlFor="assistant-widget-question" className="sr-only">Ask a sustainability question</label>
                <textarea
                  ref={inputRef}
                  id="assistant-widget-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  maxLength={2000}
                  rows={2}
                  placeholder="Ask a question…"
                  className="max-h-24 min-h-10 flex-1 resize-none border-0 bg-transparent p-1.5 text-sm text-slate-700 outline-none ring-0 placeholder:text-slate-400 focus:ring-0"
                />
                <button
                  type="submit"
                  disabled={asking || question.trim().length < 3}
                  aria-label="Send question"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#315C85] text-white transition hover:bg-[#274d75] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {asking ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400">Check cited sources; AI responses may be incorrect.</p>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
