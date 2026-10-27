import React, { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { tripsApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const ACTIVITY_ICONS = {
  attraction: '🏛️',
  food: '🍽️',
  stay: '🏨',
  transport: '🚆',
}

const ACTIVITY_COLORS = {
  attraction: 'bg-amber-50 text-amber-700 border-amber-200',
  food: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  stay: 'bg-purple-50 text-purple-700 border-purple-200',
  transport: 'bg-blue-50 text-blue-700 border-blue-200',
}

export default function TripView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()

  const [trip, setTrip] = useState(null)
  const [itinerary, setItinerary] = useState(null)
  const [activeDayIndex, setActiveDayIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Modals state
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareEmail, setShareEmail] = useState('')
  const [shareRole, setShareRole] = useState('editor')
  const [sharingLoading, setSharingLoading] = useState(false)

  const [regenModalOpen, setRegenModalOpen] = useState(false)
  const [regenInstruction, setRegenInstruction] = useState('')
  const [regenerating, setRegenerating] = useState(false)

  // Edit/Add activity inline modal
  const [editingActivity, setEditingActivity] = useState(null) // { dayIndex, actIndex, data }
  const [isNewActivity, setIsNewActivity] = useState(false)

  const fetchTrip = async () => {
    try {
      setLoading(true)
      const data = await tripsApi.get(id)
      setTrip(data)
      setItinerary(data.itinerary || { days: [], travel_tips: [] })
      setIsDirty(false)
    } catch (err) {
      toast.error('Could not load trip: ' + err.message)
      navigate('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTrip()
  }, [id])

  const canEdit = trip?.role === 'owner' || trip?.role === 'editor'
  const isOwner = trip?.role === 'owner' || trip?.owner_id === user?.id

  // Recalculate costs dynamically
  const { totalEstimatedCost, daysWithTotals } = useMemo(() => {
    if (!itinerary?.days) return { totalEstimatedCost: 0, daysWithTotals: [] }

    let grandTotal = 0
    const computedDays = itinerary.days.map((day) => {
      const dayTotal = (day.activities || []).reduce(
        (sum, act) => sum + (Number(act.estimated_cost) || 0),
        0
      )
      grandTotal += dayTotal
      return {
        ...day,
        computedTotal: Math.round(dayTotal * 100) / 100,
      }
    })

    return {
      totalEstimatedCost: Math.round(grandTotal * 100) / 100,
      daysWithTotals: computedDays,
    }
  }, [itinerary])

  const activeDay = daysWithTotals[activeDayIndex] || null

  // Save changes via PUT /trips/{id}
  const handleSaveTrip = async () => {
    if (!canEdit) return
    try {
      setSaving(true)
      const updatedItinerary = {
        ...itinerary,
        days: daysWithTotals,
        total_estimated_cost: totalEstimatedCost,
      }

      const res = await tripsApi.update(id, {
        itinerary: updatedItinerary,
      })
      setTrip(res)
      setItinerary(res.itinerary)
      setIsDirty(false)
      toast.success('Itinerary saved successfully!')
    } catch (err) {
      toast.error('Failed to save changes: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Handle Regenerate Single Day
  const handleRegenerateDay = async () => {
    if (!activeDay) return
    try {
      setRegenerating(true)
      const res = await tripsApi.regenerateDay(id, {
        day_number: activeDay.day_number,
        instruction: regenInstruction.trim() || 'Refresh and improve the activities for this day',
      })
      setTrip(res)
      setItinerary(res.itinerary)
      setRegenModalOpen(false)
      setRegenInstruction('')
      setIsDirty(false)
      toast.success(`Day ${activeDay.day_number} regenerated successfully!`)
    } catch (err) {
      toast.error('Failed to regenerate day: ' + err.message)
    } finally {
      setRegenerating(false)
    }
  }

  // Activity Delete
  const handleDeleteActivity = (actIndex) => {
    if (!canEdit) return
    if (!window.confirm('Delete this activity?')) return

    const newDays = [...itinerary.days]
    newDays[activeDayIndex].activities = newDays[activeDayIndex].activities.filter(
      (_, i) => i !== actIndex
    )

    setItinerary({ ...itinerary, days: newDays })
    setIsDirty(true)
    toast.info('Activity removed. Click "Save Changes" to commit.')
  }

  // Save Activity (Inline Edit or Add)
  const handleSaveActivityModal = (e) => {
    e.preventDefault()
    if (!editingActivity) return

    const { dayIndex, actIndex, data } = editingActivity
    const newDays = [...itinerary.days]

    if (isNewActivity) {
      if (!newDays[dayIndex].activities) newDays[dayIndex].activities = []
      newDays[dayIndex].activities.push(data)
    } else {
      newDays[dayIndex].activities[actIndex] = data
    }

    setItinerary({ ...itinerary, days: newDays })
    setIsDirty(true)
    setEditingActivity(null)
    toast.success(isNewActivity ? 'Activity added!' : 'Activity updated!')
  }

  // Share Trip
  const handleShareTrip = async (e) => {
    e.preventDefault()
    if (!shareEmail.trim()) return

    try {
      setSharingLoading(true)
      const res = await tripsApi.share(id, {
        email: shareEmail.trim(),
        role: shareRole,
      })
      toast.success(res.message || 'Invitation sent!')
      setShareEmail('')
      setShareModalOpen(false)
      // refresh members
      fetchTrip()
    } catch (err) {
      toast.error('Share failed: ' + err.message)
    } finally {
      setSharingLoading(false)
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-sm font-semibold text-slate-600">Loading itinerary...</p>
        </div>
      </Layout>
    )
  }

  const budget = Number(trip?.budget || 0)
  const percent = budget > 0 ? Math.min(Math.round((totalEstimatedCost / budget) * 100), 100) : 0
  const isOverBudget = budget > 0 && totalEstimatedCost > budget

  return (
    <Layout>
      {/* Top Header bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              to="/dashboard"
              className="text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition"
            >
              &larr; Dashboard
            </Link>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              {trip?.role === 'owner' ? 'Owner' : trip?.role}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {trip?.title}
          </h1>

          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-medium text-slate-500">
            <span className="flex items-center gap-1 text-slate-700 font-semibold">
              📍 {trip?.destination}
            </span>
            <span>•</span>
            <span>
              📅 {trip?.start_date} to {trip?.end_date}
            </span>
            <span>•</span>
            <span className="capitalize">{trip?.travel_style}</span>
            <span>•</span>
            <span className="capitalize">{trip?.pace} pace</span>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5">
          {isOwner && (
            <button
              onClick={() => setShareModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-sm transition"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>Share ({trip?.members?.length || 0})</span>
            </button>
          )}

          {canEdit && (
            <button
              onClick={handleSaveTrip}
              disabled={saving}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition shadow-sm ${
                isDirty
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 animate-pulse'
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
              }`}
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>{isDirty ? 'Save Changes *' : 'Saved'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main 2-column Grid */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Day Tabs & Timeline (2 cols on desktop) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Day Navigation Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {daysWithTotals.map((day, idx) => (
              <button
                key={day.day_number}
                onClick={() => setActiveDayIndex(idx)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold shrink-0 transition-all ${
                  activeDayIndex === idx
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div>Day {day.day_number}</div>
                <div
                  className={`text-[10px] font-normal ${
                    activeDayIndex === idx ? 'text-indigo-100' : 'text-slate-400'
                  }`}
                >
                  ${day.computedTotal}
                </div>
              </button>
            ))}
          </div>

          {/* Active Day Card */}
          {activeDay ? (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
              {/* Day Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                    Day {activeDay.day_number} &bull; {activeDay.date}
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
                    {activeDay.theme}
                  </h2>
                  <div className="text-xs text-slate-500 mt-1">
                    Day Total: <span className="font-bold text-slate-900">${activeDay.computedTotal}</span> per person
                  </div>
                </div>

                {canEdit && (
                  <button
                    onClick={() => setRegenModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition border border-indigo-200/60 shrink-0 self-start sm:self-auto"
                  >
                    <span>✨</span>
                    <span>Regenerate This Day</span>
                  </button>
                )}
              </div>

              {/* Activity Timeline List */}
              <div className="mt-6 space-y-4 relative before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-slate-100">
                {(activeDay.activities || []).map((activity, actIdx) => (
                  <div
                    key={actIdx}
                    className="relative pl-12 group"
                  >
                    {/* Timeline bullet / icon */}
                    <div className="absolute left-2.5 -translate-x-1/2 top-4 w-6 h-6 rounded-full bg-white border-2 border-indigo-600 flex items-center justify-center text-xs shadow-sm z-10">
                      {ACTIVITY_ICONS[activity.type] || '📌'}
                    </div>

                    {/* Activity Card */}
                    <div className="bg-slate-50/80 hover:bg-white rounded-2xl border border-slate-200/70 p-4 transition-all duration-200 hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 font-mono">
                              {activity.time}
                            </span>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${
                                ACTIVITY_COLORS[activity.type] || 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {activity.type}
                            </span>
                            <span className="text-xs text-slate-400">
                              ⏱️ {activity.duration_minutes}m
                            </span>
                          </div>

                          <h4 className="font-bold text-sm text-slate-900 mt-1">
                            {activity.title}
                          </h4>
                          <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                            📍 {activity.location}
                          </p>
                        </div>

                        {/* Cost & action icons */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className="text-xs font-extrabold text-slate-800 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-2xs">
                            ${activity.estimated_cost}
                          </span>

                          {canEdit && (
                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                              <button
                                onClick={() => {
                                  setIsNewActivity(false)
                                  setEditingActivity({
                                    dayIndex: activeDayIndex,
                                    actIndex: actIdx,
                                    data: { ...activity },
                                  })
                                }}
                                title="Edit activity"
                                className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteActivity(actIdx)}
                                title="Delete activity"
                                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                        {activity.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Custom Activity Button */}
              {canEdit && (
                <div className="mt-8 pt-4 border-t border-slate-100 flex justify-center">
                  <button
                    onClick={() => {
                      setIsNewActivity(true)
                      setEditingActivity({
                        dayIndex: activeDayIndex,
                        actIndex: null,
                        data: {
                          time: '12:00',
                          title: '',
                          type: 'food',
                          description: '',
                          location: '',
                          estimated_cost: 25,
                          duration_minutes: 60,
                        },
                      })
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
                  >
                    <span>+ Add Custom Activity</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 bg-white rounded-3xl border">
              No day selected.
            </div>
          )}
        </div>

        {/* Right Column: Cost Tracker, Members, Travel Tips */}
        <div className="space-y-6">
          {/* Cost Tracker Card */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm">
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center justify-between">
              <span>Budget & Cost Tracker</span>
              <span className="text-sm">💰</span>
            </h3>

            <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-semibold text-slate-500">Estimated Total</span>
                <span className={`text-base font-extrabold ${isOverBudget ? 'text-rose-600' : 'text-slate-900'}`}>
                  ${totalEstimatedCost.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-baseline text-xs text-slate-500 mb-3">
                <span>Allocated Budget</span>
                <span className="font-medium">${budget.toLocaleString()}</span>
              </div>

              {budget > 0 && (
                <div>
                  <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isOverBudget ? 'bg-rose-500' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${percent}%` }}
                    ></div>
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] font-semibold">
                    <span className={isOverBudget ? 'text-rose-600' : 'text-slate-600'}>
                      {percent}% utilized
                    </span>
                    <span className={isOverBudget ? 'text-rose-600 font-bold' : 'text-emerald-600'}>
                      {isOverBudget
                        ? `$${(totalEstimatedCost - budget).toFixed(0)} over`
                        : `$${(budget - totalEstimatedCost).toFixed(0)} remaining`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Per-Day Cost Breakdown */}
            <div className="mt-5 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Daily Breakdown
              </div>
              {daysWithTotals.map((day, i) => (
                <button
                  key={day.day_number}
                  onClick={() => setActiveDayIndex(i)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs transition ${
                    activeDayIndex === i
                      ? 'bg-indigo-50 text-indigo-900 font-bold border border-indigo-200'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span>Day {day.day_number} ({day.theme?.slice(0, 20)}...)</span>
                  <span className="font-mono font-semibold">${day.computedTotal}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Collaborators Card */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                Trip Members
              </h3>
              {isOwner && (
                <button
                  onClick={() => setShareModalOpen(true)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                >
                  + Add
                </button>
              )}
            </div>

            <div className="space-y-3">
              {/* Owner */}
              <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                    O
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Trip Organizer</div>
                    <div className="text-[10px] text-slate-500">Owner</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase bg-slate-200 px-2 py-0.5 rounded text-slate-700">
                  Owner
                </span>
              </div>

              {/* Shared members */}
              {(trip?.members || []).map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                      {m.email?.charAt(0).toUpperCase() || 'M'}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 truncate max-w-[140px]">
                        {m.full_name || m.email}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                        {m.email}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Travel Tips Card */}
          {itinerary?.travel_tips && itinerary.travel_tips.length > 0 && (
            <div className="bg-gradient-to-br from-indigo-50/60 to-purple-50/60 rounded-3xl border border-indigo-100 p-6 shadow-sm">
              <h3 className="text-base font-extrabold text-indigo-950 tracking-tight flex items-center gap-2 mb-3">
                <span>🧭</span>
                <span>AI Travel Tips</span>
              </h3>
              <ul className="space-y-2.5">
                {itinerary.travel_tips.map((tip, idx) => (
                  <li key={idx} className="text-xs text-indigo-900/80 leading-relaxed flex items-start gap-2">
                    <span className="text-indigo-500 shrink-0 mt-0.5">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Share Trip */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-extrabold text-slate-900">Share Trip with Friends</h3>
            <p className="text-xs text-slate-600 mt-1">
              Add collaborators by email to view or edit this itinerary.
            </p>

            <form onSubmit={handleShareTrip} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Friend's Registered Email
                </label>
                <input
                  type="email"
                  required
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="collaborator@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Permission Role
                </label>
                <select
                  value={shareRole}
                  onChange={(e) => setShareRole(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="editor">Editor (can edit and regenerate activities)</option>
                  <option value="viewer">Viewer (read-only)</option>
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShareModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sharingLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition"
                >
                  {sharingLoading ? 'Sharing...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Regenerate Day */}
      {regenModalOpen && activeDay && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 max-w-lg w-full shadow-2xl">
            <div className="flex items-center gap-2 text-indigo-600 text-sm font-bold">
              <span>✨</span>
              <span>Regenerate Day {activeDay.day_number} with AI</span>
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 mt-1">
              {activeDay.theme}
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Tell Gemini how you want to adjust Day {activeDay.day_number}. Other days will remain unchanged.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Your Specific Feedback / Instructions
              </label>
              <textarea
                rows={3}
                required
                value={regenInstruction}
                onChange={(e) => setRegenInstruction(e.target.value)}
                placeholder="e.g. 'Swap out the museum for outdoor park and street food stalls', or 'Keep it relaxing with an afternoon seaside coffee'"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRegenModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRegenerateDay}
                disabled={regenerating}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-95 transition flex items-center gap-2"
              >
                {regenerating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Regenerating Day {activeDay.day_number}...</span>
                  </>
                ) : (
                  <span>Regenerate with Gemini</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit or Add Activity */}
      {editingActivity && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-extrabold text-slate-900">
              {isNewActivity ? 'Add Activity' : 'Edit Activity'}
            </h3>

            <form onSubmit={handleSaveActivityModal} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Start Time
                  </label>
                  <input
                    type="text"
                    required
                    pattern="^\d{2}:\d{2}$"
                    value={editingActivity.data.time}
                    onChange={(e) =>
                      setEditingActivity({
                        ...editingActivity,
                        data: { ...editingActivity.data, time: e.target.value },
                      })
                    }
                    placeholder="09:00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Activity Type
                  </label>
                  <select
                    value={editingActivity.data.type}
                    onChange={(e) =>
                      setEditingActivity({
                        ...editingActivity,
                        data: { ...editingActivity.data, type: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="attraction">Attraction</option>
                    <option value="food">Food</option>
                    <option value="stay">Stay</option>
                    <option value="transport">Transport</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={editingActivity.data.title}
                  onChange={(e) =>
                    setEditingActivity({
                      ...editingActivity,
                      data: { ...editingActivity.data, title: e.target.value },
                    })
                  }
                  placeholder="e.g. Visit Kinkaku-ji Golden Pavilion"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Cost ($ USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    required
                    value={editingActivity.data.estimated_cost}
                    onChange={(e) =>
                      setEditingActivity({
                        ...editingActivity,
                        data: {
                          ...editingActivity.data,
                          estimated_cost: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="15"
                    step="15"
                    required
                    value={editingActivity.data.duration_minutes}
                    onChange={(e) =>
                      setEditingActivity({
                        ...editingActivity,
                        data: {
                          ...editingActivity.data,
                          duration_minutes: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Location / Address
                </label>
                <input
                  type="text"
                  required
                  value={editingActivity.data.location}
                  onChange={(e) =>
                    setEditingActivity({
                      ...editingActivity,
                      data: { ...editingActivity.data, location: e.target.value },
                    })
                  }
                  placeholder="e.g. 1 Kinkakujicho, Kita Ward, Kyoto"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  required
                  value={editingActivity.data.description}
                  onChange={(e) =>
                    setEditingActivity({
                      ...editingActivity,
                      data: { ...editingActivity.data, description: e.target.value },
                    })
                  }
                  placeholder="Details, tips, opening times..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingActivity(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition"
                >
                  Save Activity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
