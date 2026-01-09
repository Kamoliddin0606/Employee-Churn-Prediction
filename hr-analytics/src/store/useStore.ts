import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  Employee, 
  AttendanceRecord, 
  ImportHistory, 
  ThemeMode,
  FilterState,
  User 
} from '../types';

// Default admin user
const DEFAULT_ADMIN: User = {
  id: 'admin-001',
  username: 'admin',
  password: '795123*',
  isAdmin: true,
  allowedDepartments: [],
  createdAt: new Date().toISOString(),
};

interface AppState {
  employees: Employee[];
  attendance: AttendanceRecord[];
  importHistory: ImportHistory[];
  theme: ThemeMode;
  filters: FilterState;
  isImporting: boolean;
  importProgress: number;
  
  // Auth state
  users: User[];
  currentUser: User | null;
  isAuthenticated: boolean;
  
  setEmployees: (employees: Employee[]) => void;
  addEmployee: (employee: Employee) => void;
  updateEmployee: (id: string, employee: Partial<Employee>) => void;
  
  setAttendance: (attendance: AttendanceRecord[]) => void;
  addAttendanceRecords: (records: AttendanceRecord[]) => void;
  updateAttendanceRecord: (employeeId: string, date: string, record: Partial<AttendanceRecord>) => void;
  upsertAttendanceRecord: (record: AttendanceRecord) => void;
  
  addImportHistory: (history: ImportHistory) => void;
  rollbackImport: (historyId: string) => void;
  clearAllData: () => void;
  
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  
  setFilters: (filters: Partial<FilterState>) => void;
  resetFilters: () => void;
  
  setIsImporting: (isImporting: boolean) => void;
  setImportProgress: (progress: number) => void;
  
  // Auth actions
  login: (username: string, password: string) => boolean;
  logout: () => void;
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => void;
  updateUser: (id: string, user: Partial<User>) => void;
  deleteUser: (id: string) => void;
  
  // Helper to get filtered data based on user permissions
  getFilteredEmployees: () => Employee[];
  getFilteredAttendance: () => AttendanceRecord[];
}

const initialFilters: FilterState = {
  department: 'all',
  dateFrom: '',
  dateTo: '',
  searchQuery: '',
  sortBy: 'name',
  sortOrder: 'asc',
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      employees: [],
      attendance: [],
      importHistory: [],
      theme: 'light',
      filters: initialFilters,
      isImporting: false,
      importProgress: 0,
      
      // Auth state
      users: [DEFAULT_ADMIN],
      currentUser: null,
      isAuthenticated: false,

      setEmployees: (employees) => set({ employees }),
      
      addEmployee: (employee) => set((state) => {
        const exists = state.employees.find(e => e.id === employee.id);
        if (exists) {
          return {
            employees: state.employees.map(e => 
              e.id === employee.id ? { ...e, ...employee } : e
            )
          };
        }
        return { employees: [...state.employees, employee] };
      }),
      
      updateEmployee: (id, employee) => set((state) => ({
        employees: state.employees.map(e => 
          e.id === id ? { ...e, ...employee } : e
        )
      })),

      setAttendance: (attendance) => set({ attendance }),
      
      addAttendanceRecords: (records) => set((state) => ({
        attendance: [...state.attendance, ...records]
      })),
      
      updateAttendanceRecord: (employeeId, date, record) => set((state) => ({
        attendance: state.attendance.map(a => 
          a.employeeId === employeeId && a.date === date 
            ? { ...a, ...record } 
            : a
        )
      })),
      
      upsertAttendanceRecord: (record) => set((state) => {
        const existingIndex = state.attendance.findIndex(
          a => a.employeeId === record.employeeId && a.date === record.date
        );
        
        if (existingIndex >= 0) {
          const newAttendance = [...state.attendance];
          newAttendance[existingIndex] = record;
          return { attendance: newAttendance };
        }
        
        return { attendance: [...state.attendance, record] };
      }),

      addImportHistory: (history) => set((state) => ({
        importHistory: [history, ...state.importHistory].slice(0, 50)
      })),
      
      rollbackImport: (historyId) => {
        const state = get();
        const historyIndex = state.importHistory.findIndex(h => h.id === historyId);
        
        if (historyIndex < 0) return;
        
        const previousHistory = state.importHistory[historyIndex + 1];
        
        if (previousHistory) {
          set({
            employees: previousHistory.snapshot.employees,
            attendance: previousHistory.snapshot.attendance,
            importHistory: state.importHistory.slice(historyIndex + 1)
          });
        } else {
          set({
            employees: [],
            attendance: [],
            importHistory: state.importHistory.slice(historyIndex + 1)
          });
        }
      },
      
      clearAllData: () => set({
        employees: [],
        attendance: [],
        importHistory: []
      }),

      setTheme: (theme) => {
        set({ theme });
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      },
      
      toggleTheme: () => {
        const currentTheme = get().theme;
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        get().setTheme(newTheme);
      },

      setFilters: (filters) => set((state) => ({
        filters: { ...state.filters, ...filters }
      })),
      
      resetFilters: () => set({ filters: initialFilters }),

      setIsImporting: (isImporting) => set({ isImporting }),
      setImportProgress: (importProgress) => set({ importProgress }),
      
      // Auth actions
      login: (username, password) => {
        const state = get();
        const user = state.users.find(
          u => u.username === username && u.password === password
        );
        
        if (user) {
          set({
            currentUser: { ...user, lastLogin: new Date().toISOString() },
            isAuthenticated: true,
          });
          return true;
        }
        return false;
      },
      
      logout: () => set({
        currentUser: null,
        isAuthenticated: false,
      }),
      
      addUser: (userData) => set((state) => {
        const newUser: User = {
          ...userData,
          id: `user-${Date.now()}`,
          createdAt: new Date().toISOString(),
        };
        return { users: [...state.users, newUser] };
      }),
      
      updateUser: (id, userData) => set((state) => ({
        users: state.users.map(u => 
          u.id === id ? { ...u, ...userData } : u
        ),
        // Update currentUser if it's the same user
        currentUser: state.currentUser?.id === id 
          ? { ...state.currentUser, ...userData }
          : state.currentUser,
      })),
      
      deleteUser: (id) => set((state) => ({
        users: state.users.filter(u => u.id !== id),
      })),
      
      // Helper to get filtered employees based on user permissions
      getFilteredEmployees: () => {
        const state = get();
        if (!state.currentUser) return [];
        
        // Admin with no department restrictions sees all
        if (state.currentUser.allowedDepartments.length === 0) {
          return state.employees;
        }
        
        return state.employees.filter(e => 
          state.currentUser!.allowedDepartments.includes(e.department)
        );
      },
      
      // Helper to get filtered attendance based on user permissions
      getFilteredAttendance: () => {
        const state = get();
        if (!state.currentUser) return [];
        
        const filteredEmployees = state.getFilteredEmployees();
        const employeeIds = new Set(filteredEmployees.map(e => e.id));
        
        return state.attendance.filter(a => employeeIds.has(a.employeeId));
      },
    }),
    {
      name: 'hr-analytics-storage',
      partialize: (state) => ({
        employees: state.employees,
        attendance: state.attendance,
        importHistory: state.importHistory,
        theme: state.theme,
        users: state.users,
        currentUser: state.currentUser,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme === 'dark') {
          document.documentElement.classList.add('dark');
        }
      },
    }
  )
);
