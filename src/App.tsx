/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import BookAppointment from "./pages/BookAppointment";
import ManageBooking from "./pages/ManageBooking";
import InternshipAcademy from "./pages/InternshipAcademy";
import VideoTestimonials from "./pages/VideoTestimonials";
import CommunitySocial from "./pages/CommunitySocial";
import ContactLocation from "./pages/ContactLocation";
import AdminLayout from "./components/AdminLayout";
import AdminDashboard from "./pages/AdminDashboard";
import AdminAppointments from "./pages/AdminAppointments";
import AdminPatients from "./pages/AdminPatients";
import AdminContent from "./pages/AdminContent";
import AdminSettings from "./pages/AdminSettings";
import AdminServices from "./pages/AdminServices";
import AdminSchedule from "./pages/AdminSchedule";
import AdminTestimonials from "./pages/AdminTestimonials";
import AdminCaseStudies from "./pages/AdminCaseStudies";
import AdminLiveStreams from "./pages/AdminLiveStreams";
import AdminInternships from "./pages/AdminInternships";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="book-appointment" element={<BookAppointment />} />
          <Route path="manage-booking" element={<ManageBooking />} />
          <Route path="internship-academy" element={<InternshipAcademy />} />
          <Route path="video-testimonials" element={<VideoTestimonials />} />
          <Route path="community-and-social" element={<CommunitySocial />} />
          <Route path="contact-us" element={<ContactLocation />} />
        </Route>
        
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="appointments" element={<AdminAppointments />} />
          <Route path="patients" element={<AdminPatients />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="schedule" element={<AdminSchedule />} />
          <Route path="internships" element={<AdminInternships />} />
          <Route path="testimonials" element={<AdminTestimonials />} />
          <Route path="case-studies" element={<AdminCaseStudies />} />
          <Route path="live-streams" element={<AdminLiveStreams />} />
          <Route path="content" element={<AdminContent />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
