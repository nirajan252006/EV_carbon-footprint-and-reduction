import { motion } from "framer-motion";
import {
  Bot,
  FileText,
  LoaderCircle,
  MessageCircle,
  Plus,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { EmptyState, ErrorState, LoadingState } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";
import type { ChatResponse, HealthStatus, RagDocument } from "../types/api";

const suggestedQuestions = [
  "What does the GHG Protocol Corporate Standard cover?",
  "Which organization types can use the standard?",
];

export function AssistantPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setError(null);
    try {
      const [status, sources] = await Promise.all([api.getHealth(), api.getDocuments()]);
      setHealth(status);
      setDocuments(sources);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Knowledge sources could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.trim().length < 3) return;
    setAsking(true);
    setError(null);
    setAnswer(null);
    try {
      setAnswer(await api.chat(question.trim()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The assistant could not answer.");
    } finally {
      setAsking(false);
    }
  }

  async function addSample() {
    setIngesting(true);
    setError(null);
    try {
      await api.addSampleDocument();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sample source could not be indexed.");
    } finally {
      setIngesting(false);
    }
  }

  async function uploadFile(file: File | undefined) {
    if (!file) return;
    setIngesting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.uploadDocument(form);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Document could not be indexed.");
    } finally {
      setIngesting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeDocument(document: RagDocument) {
    if (!window.confirm(`Remove "${document.filename}" and its indexed passages?`)) return;
    setError(null);
    try {
      await api.deleteDocument(document.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Document could not be removed.");
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="SUSTAINABILITY KNOWLEDGE"
        title="Grounded answers."
        highlight="Traceable evidence."
        description="Ask questions about sustainability guidance. GreenTrack retrieves relevant passages, then supplies that evidence to generation and cites the supporting sources."
      />
      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      <div className={`mb-5 flex flex-wrap items-center gap-3 rounded-xl border p-4 ${health?.ai_provider_configured ? "border-ice bg-ice" : "border-amber-200 bg-amber-50"}`}>
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${health?.ai_provider_configured ? "bg-ice text-blue-700" : "bg-amber-100 text-amber-700"}`}><Bot className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">{health?.ai_provider_configured ? "AI provider configured" : "AI provider setup required"}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {health?.ai_provider_configured
              ? `${health.indexed_documents} source document(s) indexed.`
              : "Set OPENAI_API_KEY on the backend to enable embeddings and answer generation. Carbon tracking works without it."}
          </p>
        </div>
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-[9px] font-bold tracking-wider text-slate-500">{health?.ai_provider_configured ? "READY" : "OPTIONAL"}</span>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)]">
        <section className="surface-card p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-mint text-leaf"><MessageCircle className="h-5 w-5" /></span>
              <div><h2 className="text-sm font-semibold text-slate-800">Ask the assistant</h2><p className="mt-1 text-xs text-slate-400">Answers are limited to retrieved evidence.</p></div>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full bg-ice px-2.5 py-1 text-[9px] font-bold tracking-wider text-blue-700 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />SOURCE-BOUND</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {suggestedQuestions.map((item) => (
              <button key={item} type="button" onClick={() => setQuestion(item)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 transition hover:border-lavender hover:bg-ice">
                {item}
              </button>
            ))}
          </div>
          <form onSubmit={ask} className="mt-4 flex items-end gap-2 rounded-xl border border-slate-200 p-2 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-ice">
            <label htmlFor="question" className="sr-only">Ask a sustainability question</label>
            <textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} required rows={2} placeholder="Ask about your indexed sustainability documents…" className="min-h-12 flex-1 resize-y border-0 bg-transparent p-2 text-sm text-slate-700 outline-none ring-0 placeholder:text-slate-400 focus:ring-0" />
            <button type="submit" disabled={asking || question.trim().length < 3} aria-label="Send question" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:opacity-50">
              {asking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>Responses can be wrong. Check the linked source.</span><span>{question.length} / 2000</span></div>

          {asking && <div className="mt-5"><LoadingState label="Retrieving evidence and generating an answer…" /></div>}
          {answer && (
            <motion.article initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} className={`mt-5 rounded-xl border p-4 ${answer.insufficient_evidence ? "border-amber-200 bg-amber-50/60" : "border-ice bg-ice/40"}`}>
              <p className="text-[10px] font-bold tracking-[0.14em] text-leaf">{answer.insufficient_evidence ? "INSUFFICIENT EVIDENCE" : "GROUNDED RESPONSE"}</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{answer.answer}</p>
              {!!answer.sources.length && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200/70 pt-3">
                  {answer.sources.map((source) => (
                    source.source_url ? (
                      <a key={`${source.id}-${source.document_id}`} href={source.source_url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-leaf hover:border-lavender">
                        [{source.id}] {source.filename}{source.page_number ? `  ·  p. ${source.page_number}` : ""}
                      </a>
                    ) : (
                      <span key={`${source.id}-${source.document_id}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500">
                        [{source.id}] {source.filename}{source.page_number ? `  ·  p. ${source.page_number}` : ""}
                      </span>
                    )
                  ))}
                </div>
              )}
            </motion.article>
          )}
        </section>

        <aside className="surface-card p-5 sm:p-6">
          <header className="flex items-start justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-slate-800">Knowledge sources</h2><p className="mt-1 text-xs text-slate-400">Available for vector retrieval</p></div>
            <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-slate-100 px-2 text-xs font-semibold text-slate-600">{documents.length}</span>
          </header>
          {loading ? <LoadingState label="Loading indexed sources…" /> : documents.length ? (
            <div className="mt-4 grid max-h-80 gap-2 overflow-auto">
              {documents.map((document) => (
                <article key={document.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><FileText className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-700">{document.filename}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{document.chunk_count} indexed passage{document.chunk_count === 1 ? "" : "s"}</p>
                  </div>
                  <button type="button" onClick={() => void removeDocument(document)} aria-label={`Remove ${document.filename}`} className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </article>
              ))}
            </div>
          ) : <div className="mt-4"><EmptyState>No documents indexed yet.</EmptyState></div>}
          <div className="mt-4 grid gap-2">
            <button type="button" disabled={ingesting} onClick={() => void addSample()} className="btn-secondary justify-center">
              {ingesting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Index GHG Protocol source notes
            </button>
            <button type="button" disabled={ingesting} onClick={() => fileRef.current?.click()} className="btn-primary justify-center">
              <Upload className="h-4 w-4" /> {ingesting ? "Indexing document…" : "Upload document"}
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className="sr-only" onChange={(event) => void uploadFile(event.target.files?.[0])} />
          </div>
          <p className="mt-3 text-[10px] leading-5 text-slate-400">PDF, TXT, or Markdown  ·  up to 10 MB. Embeddings and answer generation require an OpenAI key on the backend.</p>
        </aside>
      </div>
    </div>
  );
}
