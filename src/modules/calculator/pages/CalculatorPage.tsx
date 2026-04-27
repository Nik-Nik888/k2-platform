import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCalcStore } from '@store/calcStore';
import { TABS } from '@modules/calculator/api/calcApi';
import { doCalc, exportPDF } from '@modules/calculator/api/doCalc';
import type { CalcResults } from '@modules/calculator/api/doCalc';
import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';
import { Loader2, AlertCircle, X, ChevronDown, ArrowLeft, Calculator, ClipboardList, FilePlus, Users } from 'lucide-react';
import { TreeRef } from '@modules/calculator/components/TreeRef';
import { DynTab } from '@modules/calculator/components/DynTab';
import { ClientPicker } from '@modules/calculator/components/modals/ClientPicker';
import { OrdersModal } from '@modules/calculator/components/modals/OrdersModal';
import { ResultsView } from '@modules/calculator/components/modals/ResultsView';

// ════════════════════════════════════════════════════════
// Главная страница калькулятора
// ════════════════════════════════════════════════════════

const LS_KEY = 'k2_calc_sel';

export function CalculatorPage() {
  const store = useCalcStore();
  const { db, isLoading, error, activeTab, setActiveTab, loadData, sel } = store;
  const { orderId: urlOrderId } = useParams<{ orderId?: string }>();
  const navigate = useNavigate();
  const [results, setResults] = useState<CalcResults | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orderInfo, setOrderInfo] = useState({ order_number: '', address: '', phone: '' });
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [showOrders, setShowOrders] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [toast, setToast] = useState('');

  // Загрузка данных
  useEffect(() => { loadData(); }, [loadData]);

  // Загрузка заказа по orderId из URL (из CRM)
  useEffect(() => {
    if (!urlOrderId) return;
    (async () => {
      try {
        const { data: order } = await supabase.from('orders').select('*').eq('id', urlOrderId).single();
        if (!order) return;
        // Загружаем form_data в стор
        if (order.form_data && typeof order.form_data === 'object') {
          Object.entries(order.form_data as Record<string, Record<string, unknown>>).forEach(([tabId, tabSel]) => {
            if (tabSel && typeof tabSel === 'object') {
              Object.entries(tabSel).forEach(([k, v]) => {
                store.setExtra(tabId, k, v);
              });
            }
          });
        }
        setOrderInfo({
          order_number: order.order_number || '',
          address: order.address || '',
          phone: order.phone || '',
        });
        setEditingOrderId(order.id);
        setClientId(order.client_id || null);
        // Загружаем имя клиента
        if (order.client_id) {
          const { data: client } = await supabase.from('clients').select('name').eq('id', order.client_id).single();
          if (client) setClientName(client.name);
        }
        notify('Заказ загружен из CRM');
      } catch {}
    })();
  }, [urlOrderId]);

  // Автонумерация заказа (только если нет urlOrderId)
  useEffect(() => {
    if (urlOrderId) return;
    (async () => {
      try {
        const { data } = await supabase.from('orders').select('order_number').order('created_at', { ascending: false }).limit(1);
        const last = data?.[0]?.order_number || '';
        const num = parseInt(last.replace(/\D/g, '')) || 0;
        setOrderInfo((p) => ({ ...p, order_number: String(num + 1) }));
      } catch {}
    })();
  }, [urlOrderId]);

  // localStorage — сохранение
  useEffect(() => {
    if (Object.keys(sel).length > 0) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(sel)); } catch {}
    }
  }, [sel]);

  // localStorage — загрузка
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([tabId, tabSel]) => {
            if (tabSel && typeof tabSel === 'object') {
              Object.entries(tabSel as Record<string, unknown>).forEach(([k, v]) => {
                store.setExtra(tabId, k, v);
              });
            }
          });
        }
      }
    } catch {}
  }, []);

  // Показать тост
  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // Расчёт
  const handleCalc = () => {
    if (!db) return;
    const r = doCalc(sel, db);
    setResults(r);
    setShowResults(true);
    notify('Расчёт выполнен!');
  };

  // Сохранение заказа
  const handleSave = async () => {
    if (!results) return;
    setSaving(true);
    try {
      const total = Object.values(results).flat().reduce((s, r: any) => s + (r.cost || 0), 0);
      const orgId = useAuthStore.getState().organization?.id;
      const data: Record<string, unknown> = {
        org_id: orgId,
        status: 'lead' as const,
        order_number: orderInfo.order_number,
        address: orderInfo.address,
        phone: orderInfo.phone,
        form_data: sel,
        results,
        total_cost: total,
      };
      if (clientId) data.client_id = clientId;

      if (editingOrderId) {
        if (!confirm('Перезаписать заказ №' + orderInfo.order_number + '?')) { setSaving(false); return; }
        // При обновлении не меняем org_id и status
        const { org_id: _, status: __, ...updateData } = data;
        const { error: saveErr } = await supabase.from('orders').update(updateData).eq('id', editingOrderId);
        if (saveErr) throw saveErr;
        notify('Заказ №' + orderInfo.order_number + ' обновлён!');
      } else {
        const { error: saveErr } = await supabase.from('orders').insert(data);
        if (saveErr) throw saveErr;
        notify('Новый заказ сохранён!');
      }

      // Сброс после сохранения
      handleReset();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения';
      notify('Ошибка: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  // Сброс формы
  const handleReset = () => {
    Object.keys(sel).forEach((tabId) => {
      Object.keys(sel[tabId] || {}).forEach((k) => {
        store.setExtra(tabId, k, undefined);
      });
    });
    setResults(null);
    setShowResults(false);
    setEditingOrderId(null);
    setClientId(null);
    setClientName(null);
    localStorage.removeItem(LS_KEY);
    const num = parseInt(String(orderInfo.order_number).replace(/\D/g, '')) || 0;
    setOrderInfo({ order_number: String(num + 1), address: '', phone: '' });
    // Если пришли с /calculator/:orderId — вернуть на /calculator
    if (urlOrderId) navigate('/calculator');
  };

  // Загрузка заказа для редактирования
  const handleLoadOrder = (order: { id: string; order_number: string; address: string; phone: string; form_data: Record<string, Record<string, unknown>> }) => {
    // Загружаем form_data в стор
    if (order.form_data && typeof order.form_data === 'object') {
      Object.entries(order.form_data).forEach(([tabId, tabSel]) => {
        if (tabSel && typeof tabSel === 'object') {
          Object.entries(tabSel as Record<string, unknown>).forEach(([k, v]) => {
            store.setExtra(tabId, k, v);
          });
        }
      });
    }
    setOrderInfo({ order_number: order.order_number || '', address: order.address || '', phone: order.phone || '' });
    setEditingOrderId(order.id);
    setResults(null);
    setShowResults(false);
    setShowOrders(false);
    notify('Заказ №' + order.order_number + ' загружен');
  };

  // PDF
  const handlePDF = (view: 'sections' | 'merged') => {
    if (results) exportPDF(results, orderInfo, view);
  };

  // Итого (для отображения в хедере)
  const grandTotal = useMemo(() => {
    if (!results) return 0;
    return Object.values(results).flat().reduce((s, r: any) => s + (r.cost || 0), 0);
  }, [results]);

  if (isLoading && !db) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <span className="ml-3 text-gray-500">Загрузка калькулятора...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
        <AlertCircle className="w-4 h-4 shrink-0" />
        {error}
      </div>
    );
  }

  const activeTabInfo = TABS.find((t) => t.id === activeTab);

  return (
    <div className="space-y-4 pb-24">
      {/* Тост */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-pulse">
          {toast}
        </div>
      )}

      {/* Заголовок + Информация о заказе */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">К2 Калькулятор</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {db ? `${db.materials.length} мат. · ${db.categories.length} кат.` : ''}
              {editingOrderId && <span className="text-brand-500 ml-1">· ред. №{orderInfo.order_number}</span>}
            </p>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            {showResults && (
              <button onClick={() => setShowResults(false)} className="btn-secondary text-xs py-1.5 px-2.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Назад
              </button>
            )}
            {!showResults && (
              <>
                <button onClick={() => setShowOrders(true)} className="btn-secondary text-xs py-1.5 px-2.5">
                  <ClipboardList className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Заказы</span>
                </button>
                {(editingOrderId || Object.keys(sel).length > 0) && (
                  <button onClick={() => { if (confirm('Очистить форму и начать новый заказ?')) handleReset(); }}
                    className="btn-secondary text-xs py-1.5 px-2.5">
                    <FilePlus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Новый</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input placeholder="№ заказа" value={orderInfo.order_number}
            onChange={(e) => setOrderInfo((p) => ({ ...p, order_number: e.target.value }))}
            className="input py-2 text-sm flex-1 min-w-[80px]" />
          <input placeholder="Адрес" value={orderInfo.address}
            onChange={(e) => setOrderInfo((p) => ({ ...p, address: e.target.value }))}
            className="input py-2 text-sm flex-1 min-w-[100px]" />
          <input placeholder="Телефон" value={orderInfo.phone}
            onChange={(e) => setOrderInfo((p) => ({ ...p, phone: e.target.value }))}
            className="input py-2 text-sm flex-1 min-w-[100px]" />
        </div>
        {/* Привязка к клиенту */}
        <div className="flex items-center gap-2 mt-2">
          {clientId && clientName ? (
            <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-lg px-3 py-1.5 text-sm flex-1">
              <Users className="w-3.5 h-3.5 text-brand-500" />
              <span className="text-brand-700 font-medium truncate">{clientName}</span>
              <button onClick={() => { setClientId(null); setClientName(null); }}
                className="text-brand-400 hover:text-red-500 ml-auto"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => setShowClientPicker(true)}
              className="flex items-center gap-1.5 text-xs text-gray-500 bg-surface-50 border border-surface-200 rounded-lg px-3 py-1.5 hover:border-brand-300 hover:text-brand-600 transition-colors">
              <Users className="w-3.5 h-3.5" /> Привязать клиента
            </button>
          )}
        </div>
        {grandTotal > 0 && (
          <div className="mt-3 flex justify-between items-center bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
            <span className="text-sm text-emerald-700">Общая стоимость</span>
            <span className="text-lg font-bold font-mono text-emerald-700">{grandTotal.toLocaleString('ru')} ₽</span>
          </div>
        )}
      </div>

      {/* Экран результатов */}
      {showResults && results ? (
        <ResultsView
          results={results}
          orderInfo={orderInfo}
          onBack={() => setShowResults(false)}
          onExportPDF={handlePDF}
          onSave={handleSave}
          saving={saving}
        />
      ) : (
        <>
          {/* Вкладки */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 lg:-mx-6 lg:px-6">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const tabCats = db?.categories.filter((c) => c.tab_id === tab.id) || [];
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all
                    ${isActive
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'bg-white border border-surface-200 text-gray-600 hover:border-brand-300 hover:text-brand-600'
                    }`}
                >
                  <span>{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tabCats.length > 0 && !isActive && (
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                      {tabCats.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Заголовок */}
          {activeTabInfo && (
            <div className="flex items-center gap-2">
              <span className="text-xl">{activeTabInfo.icon}</span>
              <h2 className="text-lg font-bold text-gray-900">{activeTabInfo.label}</h2>
            </div>
          )}

          {/* Содержимое вкладки */}
          <DynTab tabId={activeTab} />

          {/* Разделитель */}
          <div className="border-t border-dashed border-surface-200 my-4" />

          {/* Справочник */}
          <details className="card overflow-hidden">
            <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-surface-50 transition-colors select-none">
              <span className="text-lg">📖</span>
              <span className="text-sm font-bold text-gray-800 flex-1">Справочник</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </summary>
            <div className="px-4 pb-4">
              {db && <TreeRef db={db} refresh={loadData} notify={notify} />}
            </div>
          </details>
        </>
      )}

      {/* Плавающая кнопка Рассчитать */}
      {!showResults && db && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <button onClick={handleCalc}
            className="flex items-center gap-3 bg-brand-500 text-white px-5 sm:px-6 py-3 sm:py-3.5 rounded-2xl text-sm font-bold shadow-lg shadow-brand-500/30 hover:bg-brand-600 transition-colors">
            <Calculator className="w-5 h-5" />
            Рассчитать
            {grandTotal > 0 && (
              <span className="font-mono">{grandTotal.toLocaleString('ru')} ₽</span>
            )}
          </button>
        </div>
      )}

      {/* Модалка заказов */}
      {showOrders && (
        <OrdersModal
          onClose={() => setShowOrders(false)}
          onLoad={handleLoadOrder}
          notify={notify}
        />
      )}

      {/* Модалка выбора клиента */}
      {showClientPicker && (
        <ClientPicker
          onClose={() => setShowClientPicker(false)}
          onSelect={(id, name, address, phone) => {
            setClientId(id);
            setClientName(name);
            if (address && !orderInfo.address) setOrderInfo((p) => ({ ...p, address }));
            if (phone && !orderInfo.phone) setOrderInfo((p) => ({ ...p, phone }));
            setShowClientPicker(false);
            notify('Клиент привязан: ' + name);
          }}
        />
      )}
    </div>
  );
}