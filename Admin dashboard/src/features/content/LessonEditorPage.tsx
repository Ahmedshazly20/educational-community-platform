import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Eye,
  FileText,
  HelpCircle,
  Link2,
  Plus,
  Save,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import type { LessonItem, LessonItemType, LessonStatus, QuickQuestion } from '../../data/types';
import { queryClient } from '../../app/AppProviders';
import { useNotify } from '../../hooks/useNotify';
import { checkLinkAgainstAllowedDomains } from '../../lib/link-domains';
import { checkLessonPublishable } from '../../lib/publish-checklist';
import { sanitizeArticleHtml } from '../../lib/sanitize';
import { ConfirmDialog } from '../../components/ui/Dialogs';
import {
  AudienceBanner,
  Button,
  ErrorState,
  FieldError,
  ModalShell,
  PageHeader,
  SkeletonRows,
  StatusTag,
  Surface,
} from '../../components/ui/Primitives';
import { RichArticleEditor } from '../../components/editor/RichArticleEditor';
import { LessonPreviewModal } from './LessonPreviewModal';

export function LessonEditorPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notify = useNotify();

  const detailQ = useQuery({
    queryKey: keys.content.lessonDetail(id),
    queryFn: () => api.getLessonDetail(id),
    enabled: Boolean(id),
  });

  const domainsQ = useQuery({
    queryKey: keys.academic.allowedDomains,
    queryFn: () => api.getAllowedLinkDomains(),
  });

  const [title, setTitle] = React.useState('');
  const [summary, setSummary] = React.useState('');
  const [metaDirty, setMetaDirty] = React.useState(false);

  const [editingItem, setEditingItem] = React.useState<LessonItem | null>(null);
  const [newItemType, setNewItemType] = React.useState<LessonItemType | null>(null);
  const [itemTitle, setItemTitle] = React.useState('');
  const [articleJson, setArticleJson] = React.useState<Record<string, unknown> | null>(null);
  const [articleHtml, setArticleHtml] = React.useState<string>('');
  const [linkUrl, setLinkUrl] = React.useState('');
  const [itemDirty, setItemDirty] = React.useState(false);

  // Quick questions modal state
  const [qqModal, setQqModal] = React.useState<{
    itemId: string;
    question?: QuickQuestion;
  } | null>(null);
  const [qqPrompt, setQqPrompt] = React.useState('');
  const [qqExplanation, setQqExplanation] = React.useState('');
  const [qqOptions, setQqOptions] = React.useState<Array<{ text: string; isCorrect: boolean }>>([
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
  ]);

  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [deleteLessonConfirm, setDeleteLessonConfirm] = React.useState<{
    progressCount: number;
  } | null>(null);
  const [deleteItemConfirm, setDeleteItemConfirm] = React.useState<{
    item: LessonItem;
    progressCount: number;
    answersCount: number;
  } | null>(null);

  React.useEffect(() => {
    if (detailQ.data) {
      setTitle(detailQ.data.lesson.title);
      setSummary(detailQ.data.lesson.summary ?? '');
      setMetaDirty(false);
    }
  }, [detailQ.data]);

  const isDirty = metaDirty || itemDirty;

  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const blocker = useBlocker(isDirty);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: keys.content.lessonDetail(id) });
    void queryClient.invalidateQueries({ queryKey: keys.content.all });
  };

  const saveMetaMut = useMutation({
    mutationFn: () => api.updateLessonMeta(id, { title, summary: summary || null }),
    onSuccess: () => {
      setMetaDirty(false);
      invalidate();
      notify.success('تم حفظ بيانات الدرس');
    },
    onError: (e) => notify.error(e),
  });

  const statusMut = useMutation({
    mutationFn: (status: LessonStatus) => api.setLessonStatus(id, status),
    onSuccess: () => {
      invalidate();
      notify.success('تم تحديث حالة النشر');
    },
    onError: (e) => notify.error(e),
  });

  const saveItemMut = useMutation({
    mutationFn: async () => {
      if (newItemType) {
        return api.createLessonItem({
          lesson_id: id,
          item_type: newItemType,
          title: itemTitle,
          body_json: newItemType === 'article' ? articleJson : undefined,
          body_html: newItemType === 'article' ? sanitizeArticleHtml(articleHtml) : undefined,
          url: newItemType === 'link' ? linkUrl : undefined,
        });
      }
      if (editingItem) {
        return api.updateLessonItem(editingItem.id, {
          title: itemTitle,
          body_json: editingItem.item_type === 'article' ? articleJson : undefined,
          body_html: editingItem.item_type === 'article' ? sanitizeArticleHtml(articleHtml) : undefined,
          url: editingItem.item_type === 'link' ? linkUrl : undefined,
        });
      }
    },
    onSuccess: () => {
      setEditingItem(null);
      setNewItemType(null);
      setItemDirty(false);
      invalidate();
      notify.success('تم حفظ العنصر');
    },
    onError: (e) => notify.error(e),
  });

  const reorderItemsMut = useMutation({
    mutationFn: (items: LessonItem[]) =>
      api.reorderLessonItems(
        items.map((it, idx) => ({
          id: it.id,
          lesson_id: it.lesson_id,
          item_type: it.item_type,
          title: it.title,
          sort_order: idx + 1,
        }))
      ),
    onSuccess: () => {
      invalidate();
      notify.success('تم حفظ ترتيب العناصر');
    },
    onError: (e) => {
      invalidate();
      notify.error(e);
    },
  });

  const deleteItemMut = useMutation({
    mutationFn: (itemId: string) => api.deleteLessonItem(itemId),
    onSuccess: () => {
      setDeleteItemConfirm(null);
      invalidate();
      notify.success('تم حذف العنصر');
    },
    onError: (e) => notify.error(e),
  });

  const saveQuickQuestionMut = useMutation({
    mutationFn: () => {
      if (!qqModal) throw new Error('missing');
      return api.upsertQuickQuestion({
        id: qqModal.question?.id,
        item_id: qqModal.itemId,
        prompt: qqPrompt,
        explanation: qqExplanation || null,
        options: qqOptions
          .filter((o) => o.text.trim().length > 0)
          .map((o, idx) => ({
            option_text: o.text.trim(),
            is_correct: o.isCorrect,
            sort_order: idx + 1,
          })),
      });
    },
    onSuccess: () => {
      setQqModal(null);
      invalidate();
      notify.success('تم حفظ السؤال السريع');
    },
    onError: (e) => notify.error(e),
  });

  const deleteQuickQuestionMut = useMutation({
    mutationFn: (qId: string) => api.deleteQuickQuestion(qId),
    onSuccess: () => {
      invalidate();
      notify.success('تم حذف السؤال');
    },
    onError: (e) => notify.error(e),
  });

  const deleteLessonMut = useMutation({
    mutationFn: () => api.deleteLesson(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.content.all });
      setMetaDirty(false);
      setItemDirty(false);
      notify.success('تم حذف الدرس');
      navigate('/content');
    },
    onError: (e) => notify.error(e),
  });

  if (detailQ.isLoading) {
    return (
      <div>
        <PageHeader title="محرر الدرس" />
        <SkeletonRows rows={6} />
      </div>
    );
  }

  if (detailQ.error || !detailQ.data) {
    return (
      <div>
        <PageHeader title="محرر الدرس" />
        <ErrorState error={detailQ.error} onRetry={() => detailQ.refetch()} />
      </div>
    );
  }

  const { lesson, course, term, tracks, items } = detailQ.data;
  const checklist = checkLessonPublishable(items);
  const allowedDomains = domainsQ.data ?? [];
  const activeType = newItemType ?? editingItem?.item_type;
  const liveLinkCheck =
    activeType === 'link' && linkUrl.trim()
      ? checkLinkAgainstAllowedDomains(linkUrl, allowedDomains)
      : null;

  const openNewItem = (type: LessonItemType) => {
    setEditingItem(null);
    setNewItemType(type);
    setItemTitle('');
    setArticleJson({ type: 'doc', content: [] });
    setArticleHtml('<p></p>');
    setLinkUrl('');
    setItemDirty(true);
  };

  const openEditItem = (item: LessonItem) => {
    setNewItemType(null);
    setEditingItem(item);
    setItemTitle(item.title);
    setArticleJson(item.body_json);
    setArticleHtml(item.body_html ?? '<p></p>');
    setLinkUrl(item.url ?? '');
    setItemDirty(false);
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    const next = [...items];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    const a = next[idx];
    const b = next[swap];
    if (!a || !b) return;
    next[idx] = b;
    next[swap] = a;
    reorderItemsMut.mutate(next);
  };

  const openQqModal = (itemId: string, q?: QuickQuestion) => {
    setQqModal({ itemId, question: q });
    setQqPrompt(q?.prompt ?? '');
    setQqExplanation(q?.explanation ?? '');
    setQqOptions(
      q && q.options.length > 0
        ? q.options.map((o) => ({ text: o.option_text, isCorrect: o.is_correct }))
        : [
            { text: '', isCorrect: true },
            { text: '', isCorrect: false },
          ]
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={lesson.title}
        breadcrumbs={[
          { label: ar.content.title },
          { label: course.name_ar },
          { label: term.name_ar },
          { label: lesson.title },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/content')}>
              <ArrowRight className="h-4 w-4" />
              رجوع للمنهج
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4" />
              {ar.content.preview}
            </Button>
            {lesson.status === 'draft' ? (
              <Button
                size="sm"
                loading={statusMut.isPending}
                onClick={() => statusMut.mutate('published')}
              >
                {ar.content.publish}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                loading={statusMut.isPending}
                onClick={() => statusMut.mutate('draft')}
              >
                {ar.content.unpublish}
              </Button>
            )}
            {lesson.status !== 'archived' && (
              <Button
                variant="secondary"
                size="sm"
                loading={statusMut.isPending}
                onClick={() => statusMut.mutate('archived')}
              >
                <Archive className="h-4 w-4" />
                {ar.content.archive}
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                const impact = await api.getLessonDeleteImpact(id);
                setDeleteLessonConfirm({ progressCount: impact.progressCount });
              }}
            >
              <Trash2 className="h-4 w-4" />
              {ar.app.delete}
            </Button>
          </div>
        }
      />

      <AudienceBanner
        tracks={tracks.map((t) => ({ trackName: t.track.name_ar, stageName: t.stage.name_ar }))}
      />

      {lesson.status === 'published' && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
          <span>{ar.content.publishedEditWarning}</span>
        </div>
      )}

      {/* Lesson Meta + Publish Checklist */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Surface className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">بيانات الدرس</h2>
            <div className="flex items-center gap-2">
              {metaDirty && <span className="text-xs font-medium text-amber-700">تعديلات غير محفوظة</span>}
              <StatusTag
                tone={
                  lesson.status === 'published'
                    ? 'success'
                    : lesson.status === 'draft'
                    ? 'warning'
                    : 'neutral'
                }
                label={ar.content.lessonStatus[lesson.status]}
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-lesson-title" className="mb-1 block text-xs font-medium text-slate-700">
              {ar.content.lessonTitle}
            </label>
            <input
              id="edit-lesson-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setMetaDirty(true);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="edit-lesson-summary" className="mb-1 block text-xs font-medium text-slate-700">
              {ar.content.lessonSummary}
            </label>
            <textarea
              id="edit-lesson-summary"
              rows={2}
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                setMetaDirty(true);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!metaDirty}
              loading={saveMetaMut.isPending}
              onClick={() => saveMetaMut.mutate()}
            >
              <Save className="h-4 w-4" />
              {ar.app.save}
            </Button>
          </div>
        </Surface>

        <Surface className="lg:col-span-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-900">{ar.content.publishChecklistTitle}</h2>
          <ul className="space-y-2 text-xs">
            {checklist.checks.map((c) => (
              <li
                key={c.id}
                className={`flex items-start gap-2 rounded-lg border p-2.5 ${
                  c.passed
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                {c.passed ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                )}
                <span>{c.label}</span>
              </li>
            ))}
          </ul>
        </Surface>
      </div>

      {/* Items List */}
      <Surface className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <h2 className="text-base font-bold text-slate-900">
            {ar.content.itemsTitle} ({items.length})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => openNewItem('article')}>
              <FileText className="h-4 w-4" />
              + {ar.content.addItemArticle}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openNewItem('link')}>
              <Link2 className="h-4 w-4" />
              + {ar.content.addItemLink}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openNewItem('quick_questions')}>
              <HelpCircle className="h-4 w-4" />
              + {ar.content.addItemQuickQuestions}
            </Button>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {ar.content.cannotPublishWithoutItems}
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item, idx) => {
              const qList = item.quick_questions ?? [];
              const qqInvalid =
                item.item_type === 'quick_questions' &&
                (qList.length === 0 ||
                  qList.some(
                    (q) => q.options.length < 2 || q.options.filter((o) => o.is_correct).length !== 1
                  ));

              return (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500">#{idx + 1}</span>
                      <span className="font-bold text-slate-900">{item.title}</span>
                      <StatusTag tone="neutral" label={ar.content.itemTypes[item.item_type]} />
                      {item.item_type === 'link' && item.android_only && (
                        <StatusTag tone="warning" label={ar.content.androidOnlyBadge} />
                      )}
                      {qqInvalid && <StatusTag tone="danger" label="يحتاج استكمال الأسئلة" />}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={idx === 0}
                        onClick={() => moveItem(idx, -1)}
                        aria-label={`تحريك ${item.title} لأعلى`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={idx === items.length - 1}
                        onClick={() => moveItem(idx, 1)}
                        aria-label={`تحريك ${item.title} لأسفل`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openEditItem(item)}>
                        {ar.app.edit}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          const impact = await api.getLessonItemDeleteImpact(item.id);
                          setDeleteItemConfirm({ item, ...impact });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {item.item_type === 'link' && item.url && (
                    <p className="mt-2 font-mono text-xs text-slate-600" dir="ltr">
                      {item.url}
                    </p>
                  )}

                  {item.item_type === 'quick_questions' && (
                    <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-600">
                          الأسئلة ({qList.length})
                        </span>
                        <Button size="sm" onClick={() => openQqModal(item.id)}>
                          <Plus className="h-3.5 w-3.5" />
                          {ar.content.addQuestion}
                        </Button>
                      </div>
                      {qList.map((q, qi) => {
                        const correctCount = q.options.filter((o) => o.is_correct).length;
                        const valid = q.options.length >= 2 && correctCount === 1;
                        return (
                          <div
                            key={q.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                          >
                            <div>
                              <span className="font-semibold">
                                س{qi + 1}: {q.prompt}
                              </span>
                              <span className="mr-2 text-slate-500">
                                ({q.options.length} خيارات)
                              </span>
                              <span className="mr-2">
                                {valid ? (
                                  <StatusTag tone="success" label="✓ مكتمل" />
                                ) : (
                                  <StatusTag
                                    tone="warning"
                                    label={q.options.length < 2 ? '⚠ أقل من خيارين' : '⚠ حدد إجابة صحيحة'}
                                  />
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openQqModal(item.id, q)}
                              >
                                {ar.app.edit}
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => deleteQuickQuestionMut.mutate(q.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Surface>

      {/* Item Add / Edit Modal */}
      <ModalShell
        open={Boolean(newItemType || editingItem)}
        title={
          newItemType
            ? `إضافة عنصر: ${ar.content.itemTypes[newItemType]}`
            : `تعديل عنصر: ${editingItem?.title ?? ''}`
        }
        onClose={() => {
          setNewItemType(null);
          setEditingItem(null);
          setItemDirty(false);
        }}
        maxWidth="max-w-3xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveItemMut.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="item-title" className="mb-1 block text-sm font-medium">
              عنوان العنصر *
            </label>
            <input
              id="item-title"
              required
              maxLength={200}
              value={itemTitle}
              onChange={(e) => {
                setItemTitle(e.target.value);
                setItemDirty(true);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {activeType === 'article' && (
            <div>
              <label className="mb-1 block text-sm font-medium">محتوى المقال</label>
              <RichArticleEditor
                initialJson={articleJson}
                initialHtml={articleHtml}
                onChange={({ json, html }) => {
                  setArticleJson(json);
                  setArticleHtml(html);
                  setItemDirty(true);
                }}
              />
            </div>
          )}

          {activeType === 'link' && (
            <div className="space-y-3">
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                {ar.content.linkNotice}
              </p>
              <div>
                <label htmlFor="item-link-url" className="mb-1 block text-sm font-medium">
                  الرابط (HTTPS) *
                </label>
                <input
                  id="item-link-url"
                  type="url"
                  required
                  dir="ltr"
                  value={linkUrl}
                  onChange={(e) => {
                    setLinkUrl(e.target.value);
                    setItemDirty(true);
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>

              {liveLinkCheck && (
                <div className="text-xs">
                  {liveLinkCheck.errorCode ? (
                    <FieldError message={ar.errors[liveLinkCheck.errorCode]} />
                  ) : liveLinkCheck.matchedDomain ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                      <span>
                        {ar.content.allowedDomainMatched
                          .replace('{domain}', liveLinkCheck.matchedDomain.domain)
                          .replace('{kind}', ar.content.linkKinds[liveLinkCheck.matchedDomain.kind])}
                      </span>
                      {liveLinkCheck.androidOnly && (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                          <Smartphone className="h-3.5 w-3.5" />
                          {ar.content.androidOnlyBadge}
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setNewItemType(null);
                setEditingItem(null);
                setItemDirty(false);
              }}
            >
              {ar.app.cancel}
            </Button>
            <Button type="submit" loading={saveItemMut.isPending}>
              {ar.app.save}
            </Button>
          </div>
        </form>
      </ModalShell>

      {/* Quick Question Modal */}
      <ModalShell
        open={Boolean(qqModal)}
        title={qqModal?.question ? 'تعديل سؤال سريع' : ar.content.addQuestion}
        onClose={() => setQqModal(null)}
        maxWidth="max-w-xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveQuickQuestionMut.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="qq-prompt" className="mb-1 block text-sm font-medium">
              {ar.content.quickQuestionPrompt} *
            </label>
            <textarea
              id="qq-prompt"
              required
              rows={2}
              value={qqPrompt}
              onChange={(e) => setQqPrompt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">الخيارات (حدد إجابة صحيحة واحدة)</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setQqOptions((prev) => [...prev, { text: '', isCorrect: false }])}
              >
                + {ar.content.addOption}
              </Button>
            </div>
            {qqOptions.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="qq-correct-radio"
                  checked={opt.isCorrect}
                  onChange={() =>
                    setQqOptions((prev) =>
                      prev.map((o, i) => ({ ...o, isCorrect: i === idx }))
                    )
                  }
                  aria-label={`تحديد الخيار ${idx + 1} كإجابة صحيحة`}
                />
                <input
                  type="text"
                  required
                  value={opt.text}
                  onChange={(e) =>
                    setQqOptions((prev) =>
                      prev.map((o, i) => (i === idx ? { ...o, text: e.target.value } : o))
                    )
                  }
                  placeholder={`الخيار ${idx + 1}`}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
                {qqOptions.length > 2 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setQqOptions((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div>
            <label htmlFor="qq-explanation" className="mb-1 block text-sm font-medium">
              {ar.content.quickQuestionExplanation} ({ar.app.optional})
            </label>
            <textarea
              id="qq-explanation"
              rows={2}
              value={qqExplanation}
              onChange={(e) => setQqExplanation(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setQqModal(null)}>
              {ar.app.cancel}
            </Button>
            <Button type="submit" loading={saveQuickQuestionMut.isPending}>
              {ar.app.save}
            </Button>
          </div>
        </form>
      </ModalShell>

      <LessonPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        lesson={lesson}
        items={items}
      />

      <ConfirmDialog
        open={Boolean(deleteItemConfirm)}
        title={`حذف العنصر: ${deleteItemConfirm?.item.title ?? ''}`}
        message={
          deleteItemConfirm
            ? ar.content.deleteItemCascadeWarning
                .replace('{progress}', String(deleteItemConfirm.progressCount))
                .replace('{answers}', String(deleteItemConfirm.answersCount))
            : ''
        }
        danger
        loading={deleteItemMut.isPending}
        onConfirm={() => deleteItemConfirm && deleteItemMut.mutate(deleteItemConfirm.item.id)}
        onClose={() => setDeleteItemConfirm(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteLessonConfirm)}
        title={`حذف الدرس: ${lesson.title}`}
        message={
          lesson.status === 'published' && (deleteLessonConfirm?.progressCount ?? 0) > 0
            ? ar.content.deleteLessonSuggestArchive.replace(
                '{count}',
                String(deleteLessonConfirm?.progressCount ?? 0)
              )
            : 'سيتم حذف الدرس وجميع عناصره وتقدم الطلاب المرتبط به.'
        }
        danger
        loading={deleteLessonMut.isPending}
        onConfirm={() => deleteLessonMut.mutate()}
        onClose={() => setDeleteLessonConfirm(null)}
      />

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title={ar.app.unsavedChangesTitle}
        message={ar.app.unsavedChangesMessage}
        confirmLabel={ar.app.leave}
        danger
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}
