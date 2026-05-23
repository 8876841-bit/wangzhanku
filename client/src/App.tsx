import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Input from "./pages/Input";
import Library from "./pages/Library";
import Review from "./pages/Review";
import Entry from "./pages/Entry";
import Clusters from "./pages/Clusters";
import Settings from "./pages/Settings";
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/input" component={Input} />
      <Route path="/library" component={Library} />
      <Route path="/review/:id" component={Review} />
      <Route path="/entry/:id" component={Entry} />
      <Route path="/clusters" component={Clusters} />
      <Route path="/settings" component={Settings} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
          <PWAUpdatePrompt />
          <PWAInstallPrompt />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
