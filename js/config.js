/* =========================================================
   config.js — 설정
   모든 저장소 키 · IndexedDB 이름 · DB 테이블/함수 이름은 mg77_ 접두사
   (같은 github.io 주소의 다른 앱들과 절대 겹치지 않도록)
   ========================================================= */
const CFG = Object.freeze({
  SB_URL: 'https://qtmdwcndafncqixzpsxa.supabase.co',
  SB_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0bWR3Y25kYWZuY3FpeHpwc3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MDcwMTQsImV4cCI6MjA5Mjk4MzAxNH0.HGKKm4lJ40HkXZ160IajtLdGQyhKAmcoD8JsD9Mngro',

  PREFIX: 'mg77_',               // localStorage 키 접두사 (로그아웃 시 이 접두사만 삭제)
  LS_AK: 'mg77_ak',              // 접속 키
  LS_SNOOZE: 'mg77_school_snooze',
  IDB_NAME: 'mg77_db',
  IDB_STORE: 'kv',

  PIN_LEN: 6,
  POLL_MS: 60000,                // 화면이 켜져 있는 동안 변경 확인 주기
  AUTH_FAIL_MAX: 3,

  TABLES: ['students', 'student_log', 'classes', 'enrollments', 'lessons', 'todos', 'makeups',
           'exams', 'scores', 'mocks', 'mock_scores', 'events', 'counsels', 'meta'],
});
