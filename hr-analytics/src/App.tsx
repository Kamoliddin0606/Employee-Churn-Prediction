import React, { useEffect } from 'react';
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
  Globe
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Button } from './components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import { Dashboard } from './components/Dashboard';
import { FileImport } from './components/FileImport';
import { EmployeeList } from './components/EmployeeList';
import { Charts } from './components/Charts';
import { AdminPanel } from './components/AdminPanel';
import { StatusLegend } from './components/StatusLegend';
import { useStore } from './store/useStore';
import { useLanguage, languageNames, languageFlags, Language } from './i18n';

function App() {
  const { theme, toggleTheme } = useStore();
  const { language, setLanguage, t } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('dashboard');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const navItems = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'import', label: t.nav.import, icon: Upload },
    { id: 'employees', label: t.nav.employees, icon: Users },
    { id: 'charts', label: t.nav.charts, icon: BarChart3 },
    { id: 'admin', label: t.nav.settings, icon: Settings },
  ];

  const languages: Language[] = ['uz', 'ru', 'en'];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <button
              className="md:hidden p-2 hover:bg-muted rounded-md"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2">
              <img 
                src="/logo.jpg" 
                alt="Gloriya Global" 
                className="h-10 w-10 rounded-lg object-contain"
              />
              <div>
                <h1 className="text-lg font-bold">Gloriya Global</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  {t.appDescription}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Globe className="h-5 w-5" />
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
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden border-t bg-background p-4 animate-slide-in">
            <nav className="flex flex-col gap-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === item.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main className="container px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="hidden md:inline-flex">
            {navItems.map((item) => (
              <TabsTrigger key={item.id} value={item.id} className="gap-2">
                <item.icon className="h-4 w-4" />
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard" className="animate-fade-in">
            <div className="space-y-6">
              <StatusLegend />
              <Dashboard />
            </div>
          </TabsContent>

          <TabsContent value="import" className="animate-fade-in">
            <div className="max-w-3xl mx-auto">
              <FileImport />
            </div>
          </TabsContent>

          <TabsContent value="employees" className="animate-fade-in">
            <EmployeeList />
          </TabsContent>

          <TabsContent value="charts" className="animate-fade-in">
            <Charts />
          </TabsContent>

          <TabsContent value="admin" className="animate-fade-in">
            <div className="max-w-4xl mx-auto">
              <AdminPanel />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t py-6 mt-auto">
        <div className="container px-4 text-center text-sm text-muted-foreground">
          <p>{t.appName} © {new Date().getFullYear()}</p>
          <p className="mt-1">{t.footer}</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
