import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Landing from "./pages/Landing";
import AuthPage from "./pages/AuthPage";
import CompanyOnboard from "./pages/CompanyOnboard";
import CompanyDashboard from "./pages/CompanyDashboard";
import CompanyEmployees from "./pages/CompanyEmployees";
import CompanyBilling from "./pages/CompanyBilling";
import AdminPanel from "./pages/AdminPanel";
import AgentQueue from "./pages/AgentQueue";
import CustomerWidget from "./pages/CustomerWidget";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import AccountSettings from "./pages/AccountSettings";
import LegalPage from "./pages/LegalPage";
import Protected from "./components/Protected";
import PlanGate from "./components/PlanGate";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/contact" element={<LegalPage kind="contact" />} />

          <Route path="/c/:apiKey" element={<CustomerWidget />} />
          <Route path="/w/:apiKey" element={<CustomerWidget />} />

          <Route path="/onboard" element={<Protected><CompanyOnboard /></Protected>} />

          <Route path="/company" element={<Protected require="company_owner"><PlanGate><CompanyDashboard /></PlanGate></Protected>} />
          <Route path="/company/employees" element={<Protected require="company_owner"><PlanGate><CompanyEmployees /></PlanGate></Protected>} />
          <Route path="/company/calls" element={<Protected require="company_owner"><PlanGate><CompanyDashboard /></PlanGate></Protected>} />
          <Route path="/company/billing" element={<Protected require="company_owner"><CompanyBilling /></Protected>} />

          <Route path="/admin" element={<Protected require="admin"><AdminPanel /></Protected>} />
          <Route path="/agent" element={<Protected require={["employee", "company_owner"]}><AgentQueue /></Protected>} />
          <Route path="/account" element={<Protected><AccountSettings /></Protected>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
