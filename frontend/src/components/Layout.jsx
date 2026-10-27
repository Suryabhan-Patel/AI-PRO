import React from 'react'
import Navbar from './Navbar'

export default function Layout({ children, noPadding = false }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-800">
      <Navbar />
      <main className={`flex-1 ${noPadding ? '' : 'max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8'}`}>
        {children}
      </main>
      <footer className="border-t border-slate-200/80 bg-white py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500">
          WanderAI Travel Planner &copy; {new Date().getFullYear()} &bull; Powered by Gemini AI & Supabase
        </div>
      </footer>
    </div>
  )
}
