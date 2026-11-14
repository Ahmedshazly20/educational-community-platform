import React from 'react';
import { ExternalLink, Smartphone } from 'lucide-react';
import { ar } from '../../i18n/ar';
import type { Lesson, LessonItem } from '../../data/types';
import { sanitizeArticleHtml } from '../../lib/sanitize';
import { ModalShell, StatusTag } from '../../components/ui/Primitives';

export function LessonPreviewModal({
  open,
  onClose,
  lesson,
  items,
}: {
  open: boolean;
  onClose: () => void;
  lesson: Lesson;
  items: LessonItem[];
}) {
  const [selectedAnswers, setSelectedAnswers] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) setSelectedAnswers({});
  }, [open]);

  return (
    <ModalShell open={open} title={`${ar.content.preview}: ${lesson.title}`} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-5">
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900"
        >
          {ar.content.previewBanner}
        </div>

        {lesson.summary && <p className="text-sm text-slate-600">{lesson.summary}</p>}

        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">لا توجد عناصر في هذا الدرس بعد.</p>
        ) : (
          <div className="space-y-6">
            {items.map((item, idx) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <h3 className="text-base font-bold text-slate-900">
                    {idx + 1}. {item.title}
                  </h3>
                  <StatusTag tone="neutral" label={ar.content.itemTypes[item.item_type]} />
                </div>

                {item.item_type === 'article' && (
                  <div
                    className="prose prose-sm max-w-none text-slate-800 leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeArticleHtml(item.body_html ?? ''),
                    }}
                  />
                )}

                {item.item_type === 'link' && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <p className="text-sm font-medium text-slate-800" dir="ltr">
                        {item.url}
                      </p>
                      {item.android_only && (
                        <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                          <Smartphone className="h-4 w-4" />
                          <span>{ar.content.androidOnlyBadge}</span>
                        </div>
                      )}
                    </div>
                    {!item.android_only && item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-g700 px-3 py-2 text-xs font-medium text-white hover:bg-g800"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        فتح المستند
                      </a>
                    )}
                  </div>
                )}

                {item.item_type === 'quick_questions' && (
                  <div className="space-y-4">
                    {(item.quick_questions ?? []).map((q, qIdx) => {
                      const chosenId = selectedAnswers[q.id];
                      const chosenOpt = q.options.find((o) => o.id === chosenId);
                      return (
                        <div key={q.id} className="rounded-lg border border-slate-200 p-4">
                          <p className="mb-3 text-sm font-semibold text-slate-900">
                            س{qIdx + 1}: {q.prompt}
                          </p>
                          <div className="space-y-2">
                            {q.options.map((opt) => {
                              const isPicked = chosenId === opt.id;
                              let cls = 'border-slate-200 bg-white hover:bg-slate-50';
                              if (chosenId) {
                                if (opt.is_correct) cls = 'border-emerald-400 bg-emerald-50 text-emerald-900';
                                else if (isPicked) cls = 'border-red-300 bg-red-50 text-red-900';
                              }
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() =>
                                    setSelectedAnswers((prev) => ({ ...prev, [q.id]: opt.id }))
                                  }
                                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-right text-sm transition-colors cursor-pointer ${cls}`}
                                >
                                  <span>{opt.option_text}</span>
                                  {chosenId && opt.is_correct && (
                                    <span className="text-xs font-bold text-emerald-700">✓ إجابة صحيحة</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {chosenOpt && q.explanation && (
                            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                              <span className="font-semibold">التفسير: </span>
                              {q.explanation}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
