import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import DrawingPage from "@/pages/DrawingPage";
import DeckingFinishedPage from "@/pages/DeckingFinishedPage";
import FenceFinishedPage from "@/pages/FenceFinishedPage";
import NotFound from "@/pages/not-found";
import StartPage from "@/pages/StartPage";
import AuthPage from "@/pages/AuthPage";
import ProjectsDashboard from "@/pages/ProjectsDashboard";
import NewProjectWizard from "@/pages/NewProjectWizard";
import TitanRailComingSoonPage from "@/pages/TitanRailComingSoonPage";
import PlannerEntryPage from "@/pages/PlannerEntryPage";
import DeckingEntryPage from "@/pages/DeckingEntryPage";
import { AuthInitializer } from "@/components/AuthInitializer";

function Router() {
  return (
    <Switch>
      <Route path="/" component={StartPage} />
      <Route path="/login" component={AuthPage} />
      <Route path="/projects" component={ProjectsDashboard} />
      <Route path="/new" component={NewProjectWizard} />
      <Route path="/coming-soon/titan-rail" component={TitanRailComingSoonPage} />
      <Route path="/planner/new" component={PlannerEntryPage} />
      <Route path="/planner/:projectId" component={PlannerEntryPage} />
      <Route path="/decking/new" component={DeckingEntryPage} />
      <Route path="/decking/:projectId" component={DeckingEntryPage} />
      <Route path="/drawing" component={DrawingPage} />
      <Route path="/decking/finished" component={DeckingFinishedPage} />
      <Route path="/planner/finished" component={FenceFinishedPage} />
      <Route path="/decking" component={DeckingEntryPage} />
      <Route path="/planner" component={PlannerEntryPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthInitializer />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
