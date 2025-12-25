import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar, CheckCircle2, Circle, Trash2, Plus,
  FileSpreadsheet, Download, Upload, X, ChevronLeft, ChevronRight,
  Building2, MapPin, DollarSign, Flower, Mail
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken
} from 'firebase/auth';
import {
  getFirestore, collection, addDoc, query, onSnapshot,
  deleteDoc, doc, updateDoc, orderBy, serverTimestamp
} from 'firebase/firestore';

// --- Firebase Configuration ---
// [중요] 에디터 미리보기 환경에서는 아래 코드가 자동으로 설정을 불러옵니다.
// Vercel 등 외부에 배포할 때는 아래 `__firebase_config` 부분을 지우고, 
// 본인의 실제 Firebase 프로젝트 설정 객체로 대체해야 합니다.
/* // [배포용 설정 예시]
const firebaseConfig = {
  apiKey: "본인의_API_KEY",
  authDomain: "본인의_PROJECT_ID.firebaseapp.com",
  projectId: "본인의_PROJECT_ID",
  storageBucket: "본인의_PROJECT_ID.appspot.com",
  messagingSenderId: "본인의_SENDER_ID",
  appId: "본인의_APP_ID"
};
*/

// 현재 에디터 환경용 설정 (수정하지 마세요)
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Script Loader for XLSX ---
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [xlsxLoaded, setXlsxLoaded] = useState(false);

  // Form States
  const [newEvent, setNewEvent] = useState({
    companyName: '',
    eventType: '결혼', // 결혼, 장례, 개업, 기타
    date: '',
    note: '',
    checklist: {
      wreath: false, // 화환
      money: false,  // 경조금
      telegram: false // 전보/메시지
    }
  });

  // --- Auth & Initial Load ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        // 에디터 환경의 특수 토큰 처리 (배포 시에는 signInAnonymously만 사용해도 무방)
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
    });

    // Load XLSX
    loadScript("https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js")
      .then(() => setXlsxLoaded(true))
      .catch((err) => console.error("XLSX Load Error:", err));

    return () => unsubscribe();
  }, []);

  // --- Firestore Data Sync ---
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'artifacts', appId, 'users', user.uid, 'events'),
      orderBy('date', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedEvents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEvents(loadedEvents);
    }, (error) => {
      console.error("Data Fetch Error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // --- Date Helpers ---
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // --- Event Handlers ---
  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDateClick = (day) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    setSelectedDate(newDate);
    // Auto-fill date in form
    setNewEvent(prev => ({ ...prev, date: formatDate(newDate) }));
  };

  const handleAddEvent = async () => {
    if (!user || !newEvent.companyName || !newEvent.date) return;

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'events'), {
        ...newEvent,
        createdAt: serverTimestamp(),
        isCompleted: false
      });
      setIsModalOpen(false);
      setNewEvent({
        companyName: '',
        eventType: '결혼',
        date: formatDate(selectedDate),
        note: '',
        checklist: { wreath: false, money: false, telegram: false }
      });
    } catch (error) {
      console.error("Add Event Error:", error);
    }
  };

  const toggleChecklistItem = async (eventId, itemKey, currentVal, fullChecklist) => {
    if (!user) return;

    const updatedChecklist = { ...fullChecklist, [itemKey]: !currentVal };
    const allChecked = Object.values(updatedChecklist).every(val => val === true);

    try {
      const eventRef = doc(db, 'artifacts', appId, 'users', user.uid, 'events', eventId);
      await updateDoc(eventRef, {
        [`checklist.${itemKey}`]: !currentVal,
        isCompleted: allChecked
      });
    } catch (error) {
      console.error("Update Error:", error);
    }
  };

  const handleDeleteRequest = (id) => {
    setDeleteTargetId(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!user || !deleteTargetId) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'events', deleteTargetId));
      setIsDeleteModalOpen(false);
      setDeleteTargetId(null);
    } catch (error) {
      console.error("Delete Error:", error);
    }
  };

  // --- Excel Functions ---
  const exportToExcel = () => {
    if (!xlsxLoaded || events.length === 0) return;

    const data = events.map(e => ({
      날짜: e.date,
      회사명: e.companyName,
      구분: e.eventType,
      화환보냄: e.checklist.wreath ? 'O' : 'X',
      경조금보냄: e.checklist.money ? 'O' : 'X',
      전보보냄: e.checklist.telegram ? 'O' : 'X',
      완료여부: e.isCompleted ? '완료' : '진행중',
      메모: e.note
    }));

    const ws = window.XLSX.utils.json_to_sheet(data);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "경조사목록");
    window.XLSX.writeFile(wb, `경조사관리_${formatDate(new Date())}.xlsx`);
  };

  const importFromExcel = (e) => {
    if (!xlsxLoaded || !e.target.files[0] || !user) return;

    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = window.XLSX.read(bstr, { type: 'binary' });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      const data = window.XLSX.utils.sheet_to_json(ws);

      const batchPromises = data.map(row => {
        return addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'events'), {
          companyName: row['회사명'] || 'Unknown',
          date: row['날짜'] || formatDate(new Date()),
          eventType: row['구분'] || '기타',
          checklist: {
            wreath: row['화환보냄'] === 'O',
            money: row['경조금보냄'] === 'O',
            telegram: row['전보보냄'] === 'O'
          },
          note: row['메모'] || '',
          isCompleted: row['완료여부'] === '완료',
          createdAt: serverTimestamp()
        });
      });

      await Promise.all(batchPromises);
      alert(`${data.length}건의 데이터가 성공적으로 불러와졌습니다.`);
    };
    reader.readAsBinaryString(file);
  };

  // --- Render Helpers ---
  const filteredEvents = useMemo(() => {
    const targetDateStr = formatDate(selectedDate);
    return events.filter(e => e.date === targetDateStr);
  }, [events, selectedDate]);

  const getEventBadgeColor = (type) => {
    switch (type) {
      case '결혼': return 'bg-pink-100 text-pink-700 border-pink-200';
      case '장례': return 'bg-gray-100 text-gray-700 border-gray-200';
      case '개업': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-purple-100 text-purple-700 border-purple-200';
    }
  };

  const CalendarGrid = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-14 sm:h-24 bg-gray-50/30"></div>);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDate(new Date(year, month, d));
      const daysEvents = events.filter(e => e.date === dateStr);
      const isSelected = selectedDate.getDate() === d &&
        selectedDate.getMonth() === month &&
        selectedDate.getFullYear() === year;
      const isToday = new Date().getDate() === d &&
        new Date().getMonth() === month &&
        new Date().getFullYear() === year;

      days.push(
        <div
          key={d}
          onClick={() => handleDateClick(d)}
          className={`h-14 sm:h-24 border-t border-r border-gray-100 relative cursor-pointer hover:bg-indigo-50 transition-colors flex flex-col items-center pt-1 sm:pt-2
            ${isSelected ? 'bg-indigo-50 font-semibold' : 'bg-white'}
          `}
        >
          <span className={`text-sm w-7 h-7 flex items-center justify-center rounded-full
            ${isToday ? 'bg-indigo-600 text-white' : isSelected ? 'text-indigo-600' : 'text-gray-700'}
          `}>
            {d}
          </span>

          <div className="flex flex-wrap justify-center gap-1 mt-1 w-full px-1">
            {daysEvents.map((ev, idx) => (
              idx < 3 ? (
                <div key={ev.id} className={`w-1.5 h-1.5 rounded-full ${ev.isCompleted ? 'bg-green-500' : 'bg-orange-400'}`} />
              ) : idx === 3 ? (
                <div key="more" className="text-[8px] text-gray-400">+</div>
              ) : null
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-7 text-center text-xs sm:text-sm border-l border-b border-gray-200 rounded-lg overflow-hidden shadow-sm">
        {['일', '월', '화', '수', '목', '금', '토'].map(day => (
          <div key={day} className={`py-2 font-medium bg-gray-50 border-r border-gray-200 ${day === '일' ? 'text-red-500' : 'text-gray-600'}`}>
            {day}
          </div>
        ))}
        {days}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-20 sm:pb-10">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-800 hidden sm:block">Secretary Mate</h1>
            <h1 className="text-xl font-bold text-gray-800 sm:hidden">경조사 매니저</h1>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              id="excel-upload"
              className="hidden"
              accept=".xlsx, .xls"
              onChange={importFromExcel}
            />
            <button
              onClick={() => document.getElementById('excel-upload').click()}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
              title="엑셀 불러오기"
            >
              <Upload className="w-5 h-5" />
            </button>
            <button
              onClick={exportToExcel}
              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-1"
              title="엑셀 내보내기"
            >
              <FileSpreadsheet className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="ml-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1 text-sm font-medium shadow-md active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">일정 추가</span>
              <span className="sm:hidden">추가</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Calendar Section */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-500" />
              {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
            </h2>
            <div className="flex items-center gap-1">
              <button onClick={handlePrevMonth} className="p-1 hover:bg-gray-100 rounded-full">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <button onClick={handleNextMonth} className="p-1 hover:bg-gray-100 rounded-full">
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
          <CalendarGrid />
        </div>

        {/* Daily List Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-800 px-1 border-l-4 border-indigo-500 pl-3">
            {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 일정
          </h3>

          {filteredEvents.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-dashed border-gray-300">
              <p>등록된 경조사 일정이 없습니다.</p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-2 text-indigo-600 text-sm hover:underline"
              >
                + 새 일정 추가하기
              </button>
            </div>
          ) : (
            filteredEvents.map(event => (
              <div
                key={event.id}
                className={`bg-white rounded-xl shadow-sm border transition-all duration-300 overflow-hidden
                  ${event.isCompleted ? 'border-green-200 bg-green-50/30' : 'border-gray-200 hover:border-indigo-300'}
                `}
              >
                {/* Event Header */}
                <div className="p-4 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getEventBadgeColor(event.eventType)}`}>
                        {event.eventType}
                      </span>
                      {event.isCompleted && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold border border-green-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> 완료
                        </span>
                      )}
                    </div>
                    <h4 className="text-lg font-bold text-gray-800">{event.companyName}</h4>
                    {event.note && <p className="text-sm text-gray-500 mt-1">{event.note}</p>}
                  </div>
                  <button
                    onClick={() => handleDeleteRequest(event.id)}
                    className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Progress Bar */}
                <div className="h-1 w-full bg-gray-100">
                  <div
                    className={`h-full transition-all duration-500 ${event.isCompleted ? 'bg-green-500' : 'bg-indigo-500'}`}
                    style={{
                      width: `${(Object.values(event.checklist).filter(Boolean).length / 3) * 100
                        }%`
                    }}
                  />
                </div>

                {/* Checklist Actions */}
                <div className="grid grid-cols-3 divide-x divide-gray-100 bg-gray-50/50">
                  <button
                    onClick={() => toggleChecklistItem(event.id, 'wreath', event.checklist.wreath, event.checklist)}
                    className={`p-3 flex flex-col items-center gap-1 transition-colors ${event.checklist.wreath ? 'text-indigo-600 bg-indigo-50/50' : 'text-gray-400 hover:bg-gray-100'}`}
                  >
                    <Flower className="w-5 h-5" />
                    <span className="text-xs font-medium">화환</span>
                    {event.checklist.wreath ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                  </button>

                  <button
                    onClick={() => toggleChecklistItem(event.id, 'money', event.checklist.money, event.checklist)}
                    className={`p-3 flex flex-col items-center gap-1 transition-colors ${event.checklist.money ? 'text-indigo-600 bg-indigo-50/50' : 'text-gray-400 hover:bg-gray-100'}`}
                  >
                    <DollarSign className="w-5 h-5" />
                    <span className="text-xs font-medium">경조금</span>
                    {event.checklist.money ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                  </button>

                  <button
                    onClick={() => toggleChecklistItem(event.id, 'telegram', event.checklist.telegram, event.checklist)}
                    className={`p-3 flex flex-col items-center gap-1 transition-colors ${event.checklist.telegram ? 'text-indigo-600 bg-indigo-50/50' : 'text-gray-400 hover:bg-gray-100'}`}
                  >
                    <Mail className="w-5 h-5" />
                    <span className="text-xs font-medium">전보/방문</span>
                    {event.checklist.telegram ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Add Event Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg">새 경조사 등록</h3>
              <button onClick={() => setIsModalOpen(false)} className="hover:bg-indigo-700 p-1 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">날짜</label>
                <input
                  type="date"
                  value={newEvent.date}
                  onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">회사명 (거래처)</label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="(주)한국무역"
                    value={newEvent.companyName}
                    onChange={e => setNewEvent({ ...newEvent, companyName: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">구분</label>
                  <select
                    value={newEvent.eventType}
                    onChange={e => setNewEvent({ ...newEvent, eventType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="결혼">결혼 (축하)</option>
                    <option value="장례">장례 (조의)</option>
                    <option value="개업">개업 (축하)</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
                  <input
                    type="text"
                    placeholder="김부장님 장남"
                    value={newEvent.note}
                    onChange={e => setNewEvent({ ...newEvent, note: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleAddEvent}
                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-md active:scale-95 transition-all"
              >
                등록하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-xs w-full shadow-xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">일정 삭제</h3>
            <p className="text-gray-600 mb-6">이 경조사 기록을 정말 삭제하시겠습니까?<br />삭제 후에는 복구할 수 없습니다.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}