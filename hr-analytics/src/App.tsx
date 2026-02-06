import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Upload,
  Users,
  BarChart3,
  Settings,
  Moon,
  Sun,
  Menu,
  X,
  Globe,
  Clock,
  AlertTriangle,
  DollarSign,
  Database,
  ChevronLeft,
  ChevronRight,
  UserCheck
} from 'lucide-react';
import { Tabs, TabsContent } from './components/ui/tabs';
import { Button } from './components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import { Dashboard } from './components/Dashboard';
import { FileImportBackend } from './components/FileImportBackend';
import { EmployeeList } from './components/EmployeeList';
import { Charts } from './components/Charts';
import { AdminPanel } from './components/AdminPanel';
import { StatusLegend } from './components/StatusLegend';
import ScheduleManager from './components/ScheduleManager';
import ViolationReport from './components/ViolationReport';
import CompensationManager from './components/CompensationManager';
import PenaltyManager from './components/PenaltyManager';
import MissingTimeSettings from './components/MissingTimeSettings';
import DatabaseExplorer from './components/DatabaseExplorer';
import EmployeeStatusManager from './components/EmployeeStatusManager';
import DatabaseManager from './components/DatabaseManager';
import TimeRecordsCorrection from './components/TimeRecordsCorrection';
import { useStore } from './store/useStore';
import { useLanguage, languageNames, languageFlags, Language } from './i18n';

// =============================================================================
// NAVIGATION CONFIGURATION
// =============================================================================

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function App() {
  const { theme, toggleTheme } = useStore();
  const { language, setLanguage, t } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Navigation groups for better organization
  const navGroups: NavGroup[] = [
    {
      id: 'main',
      label: 'Asosiy',
      items: [
        { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
        { id: 'charts', label: t.nav.charts, icon: BarChart3 },
      ]
    },
    {
      id: 'employees',
      label: 'Xodimlar',
      items: [
        { id: 'employees', label: t.nav.employees, icon: Users },
        { id: 'employee-status', label: 'Holat', icon: UserCheck },
        { id: 'import', label: t.nav.import, icon: Upload },
        { id: 'time-correction', label: 'Time Correction', icon: Clock },
      ]
    },
    {
      id: 'schedules',
      label: 'Jadvallar',
      items: [
        { id: 'schedules', label: 'Ish Jadvali', icon: Clock },
        { id: 'missing-time', label: 'Yo\'q Vaqt', icon: Clock },
      ]
    },
    {
      id: 'violations',
      label: 'Buzilishlar',
      items: [
        { id: 'violations', label: 'Hisobot', icon: AlertTriangle },
        { id: 'penalties', label: 'Jarimalar', icon: AlertTriangle },
      ]
    },
    {
      id: 'finance',
      label: 'Moliya',
      items: [
        { id: 'compensation', label: 'KPI va Maosh', icon: DollarSign },
      ]
    },
    {
      id: 'system',
      label: 'Tizim',
      items: [
        { id: 'db-explorer', label: 'DB Explorer', icon: Database },
        { id: 'db-manager', label: 'DB Boshqaruv', icon: Database },
        { id: 'admin', label: t.nav.settings, icon: Settings },
      ]
    }
  ];

  // Flat list for mobile menu
  const allNavItems = navGroups.flatMap(g => g.items);

  const languages: Language[] = ['uz', 'ru', 'en'];

  // Get current page title
  const currentItem = allNavItems.find(item => item.id === activeTab);
  const currentGroup = navGroups.find(g => g.items.some(i => i.id === activeTab));

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Desktop Sidebar - Fixed height, scrollable nav */}
      <aside className={`hidden lg:flex flex-col border-r bg-card transition-all duration-300 h-screen sticky top-0 ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}>
        {/* Logo */}
        <div className="h-16 border-b flex items-center justify-between px-4">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <img
                src="/logo.jpg"
                alt="Gloriya Global"
                className="h-8 w-8 rounded-lg object-contain"
              />
              <span className="font-bold text-sm">Gloriya Global</span>
            </div>
          )}
          {sidebarCollapsed && (
            <img
              src="/logo.jpg"
              alt="Gloriya Global"
              className="h-8 w-8 rounded-lg object-contain mx-auto"
            />
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1 hover:bg-muted rounded hidden lg:block"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          {navGroups.map((group) => (
            <div key={group.id} className="mb-4">
              {!sidebarCollapsed && (
                <div className="px-4 mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>
              )}
              <div className="space-y-1 px-2">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                      } ${sidebarCollapsed ? 'justify-center' : ''}`}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t p-4">
          <div className={`flex ${sidebarCollapsed ? 'flex-col gap-2' : 'items-center justify-between'}`}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Globe className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {languages.map((lang) => (
                  <DropdownMenuItem
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={language === lang ? 'bg-accent' : ''}
                  >
                    <span className="mr-2">{languageFlags[lang]}</span>
                    {languageNames[lang]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="rounded-full"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header (Mobile + Tablet) */}
        <header className="lg:hidden sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <button
                className="p-2 hover:bg-muted rounded-md"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <div className="flex items-center gap-2">
                <img
                  src="/logo.jpg"
                  alt="Gloriya Global"
                  className="h-8 w-8 rounded-lg object-contain"
                />
                <span className="font-bold text-sm hidden sm:block">Gloriya Global</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                    <Globe className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {languages.map((lang) => (
                    <DropdownMenuItem
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={language === lang ? 'bg-accent' : ''}
                    >
                      <span className="mr-2">{languageFlags[lang]}</span>
                      {languageNames[lang]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="rounded-full h-8 w-8"
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Mobile Menu */}
          {isMobileMenuOpen && (
            <div className="border-t bg-background p-4 max-h-[70vh] overflow-y-auto">
              {navGroups.map((group) => (
                <div key={group.id} className="mb-4">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            setIsMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </header>

        {/* Page Header - Fixed */}
        <div className="hidden lg:block border-b bg-background px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {currentGroup && <span>{currentGroup.label}</span>}
            {currentGroup && currentItem && <span>/</span>}
            {currentItem && <span className="text-foreground font-medium">{currentItem.label}</span>}
          </div>
        </div>

        {/* Main Content - Scrollable */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 lg:px-6 py-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">

          <TabsContent value="dashboard" className="animate-fade-in">
            <div className="space-y-6">
              <StatusLegend />
              <Dashboard />
            </div>
          </TabsContent>

          <TabsContent value="import" className="animate-fade-in">
            <div className="max-w-3xl mx-auto">
              <FileImportBackend />
            </div>
          </TabsContent>

          <TabsContent value="time-correction" className="animate-fade-in">
            <TimeRecordsCorrection />
          </TabsContent>

          <TabsContent value="employees" className="animate-fade-in">
            <EmployeeList />
          </TabsContent>

          <TabsContent value="employee-status" className="animate-fade-in">
            <EmployeeStatusManager />
          </TabsContent>

          <TabsContent value="charts" className="animate-fade-in">
            <Charts />
          </TabsContent>

          <TabsContent value="schedules" className="animate-fade-in">
            <ScheduleManager />
          </TabsContent>

          <TabsContent value="violations" className="animate-fade-in">
            <ViolationReport />
          </TabsContent>

          <TabsContent value="compensation" className="animate-fade-in">
            <CompensationManager />
          </TabsContent>

          <TabsContent value="penalties" className="animate-fade-in">
            <PenaltyManager />
          </TabsContent>

          <TabsContent value="missing-time" className="animate-fade-in">
            <MissingTimeSettings />
          </TabsContent>

          <TabsContent value="db-explorer" className="animate-fade-in">
            <DatabaseExplorer />
          </TabsContent>

          <TabsContent value="db-manager" className="animate-fade-in">
            <DatabaseManager />
          </TabsContent>

          <TabsContent value="admin" className="animate-fade-in">
            <div className="max-w-4xl mx-auto">
              <AdminPanel />
            </div>
          </TabsContent>
            </Tabs>
          </div>
        </main>

        {/* Footer - Fixed at bottom */}
        <footer className="border-t py-3 bg-background flex-shrink-0">
          <div className="px-6 text-center text-xs text-muted-foreground">
            <p>{t.appName} © {new Date().getFullYear()}</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
