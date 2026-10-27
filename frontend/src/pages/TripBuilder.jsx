import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { tripsApi } from '../api/client'
import { useToast } from '../context/ToastContext'

const INTEREST_OPTIONS = [
  { id: 'food', label: 'Food & Dining', icon: '🍜' },
  { id: 'culture', label: 'History & Culture', icon: '🏛️' },
  { id: 'nature', label: 'Hiking & Nature', icon: '🌲' },
  { id: 'beach', label: 'Beaches & Ocean', icon: '🏖️' },
  { id: 'art', label: 'Art & Museums', icon: '🎨' },
  { id: 'nightlife', label: 'Nightlife & Bars', icon: '🍸' },
  { id: 'shopping', label: 'Shopping & Markets', icon: '🛍️' },
  { id: 'photography', label: 'Scenic Photography', icon: '📸' },
  { id: 'relaxation', label: 'Wellness & Spa', icon: '🧖' },
  { id: 'adventure', label: 'Extreme Adventure', icon: '🧗' },
]

const TRAVEL_STYLES = [
  { id: 'cultural', label: 'Cultural', desc: 'Museums, historic landmarks, local traditions' },
  { id: 'adventure', label: 'Adventure', desc: 'Outdoor thrills, nature exploration, trekking' },
  { id: 'luxury', label: 'Luxury', desc: 'Fine dining, 5-star stays, premium experiences' },
  { id: 'backpacker', label: 'Backpacker', desc: 'Budget-smart, hostels, authentic street culture' },
  { id: 'family', label: 'Family', desc: 'Kid-friendly sights, relaxed timing, safe venues' },
  { id: 'business', label: 'Business', desc: 'Productive schedules, central stays, networking' },
]

const LOADING_MESSAGES = [
  'Scouting top-rated local spots in your destination...',
  'Balancing activity times to minimize transit...',
  'Checking estimated costs against your budget...',
  'Selecting authentic dining recommendations...',
  'Assembling your personalized day-by-day plan...',
]

export default function TripBuilder() {
  const navigate = useNavigate()
  const toast = useToast()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0)

  // Form State
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [budget, setBudget] = useState(1500)
  const [groupSize, setGroupSize] = useState(2)
  const [travelStyle, setTravelStyle] = useState('cultural')
  const [interests, setInterests] = useState(['food', 'culture'])
  const [pace, setPace] = useState('moderate') // relaxed | moderate | fast
  const [notes, setNotes] = useState('')

  const toggleInterest = (id) => {
    if (interests.includes(id)) {
      setInterests(interests.filter((i) => i !== id))
    } else {
      setInterests([...interests, id])
    }
  }

  const validateStep1 = () => {
    if (!destination.trim()) {
      toast.warning('Please enter a destination.')
      return false
    }
    if (!startDate || !endDate) {
      toast.warning('Please choose both start and end dates.')
      return false
    }
    if (new Date(endDate) < new Date(startDate)) {
      toast.warning('End date cannot be earlier than start date.')
      return false
    }
    return true
  }

  const validateStep2 = () => {
    if (!budget || budget <= 0) {
      toast.warning('Please enter a valid budget.')
      return false
    }
    if (!groupSize || groupSize < 1) {
      toast.warning('Group size must be at least 1.')
      return false
    }
    return true
  }

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return
    if (step === 2 && !validateStep2()) return
    setStep((prev) => Math.min(prev + 1, 4))
  }

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 1))
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)

      // Cycle loading messages for engaging UX
      const interval = setInterval(() => {
        setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length)
      }, 2400)

      const payload = {
        destination: destination.trim(),
        start_date: startDate,
        end_date: endDate,
        budget: Number(budget),
        group_size: Number(groupSize),
        travel_style: travelStyle,
        interests: interests,
        pace: pace,
        notes: notes.trim() || undefined,
      }

      const trip = await tripsApi.generate(payload)
      clearInterval(interval)
      toast.success('Your itinerary is ready!')
      navigate(`/trips/${trip.id}`)
    } catch (err) {
      clearInterval(interval)
      setLoading(false)
      toast.error('Failed to generate trip: ' + err.message)
    }
  }

  return (
    <Layout>
      {/* Full-screen AI Generation Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-white text-center">
          <div className="relative mb-8">
            <div className="w-24 h-24 rounded-full border-4 border-indigo-400 border-t-transparent animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center text-3xl">
              ✈️
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-indigo-200 via-white to-purple-200 bg-clip-text text-transparent">
            AI Travel Agent at Work
          </h2>
          <p className="text-indigo-200 text-sm sm:text-base max-w-md h-12 transition-all duration-300">
            {LOADING_MESSAGES[loadingMessageIndex]}
          </p>
          <div className="mt-8 flex items-center gap-2 text-xs text-slate-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            Crafting custom itinerary for {destination}...
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        {/* Step indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
            <span>Step {step} of 4</span>
            <span>
              {step === 1 && 'Destination & Dates'}
              {step === 2 && 'Budget & Group'}
              {step === 3 && 'Style & Interests'}
              {step === 4 && 'Review & Generate'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i <= step ? 'bg-indigo-600' : 'bg-slate-200'
                }`}
              ></div>
            ))}
          </div>
        </div>

        {/* Wizard Form Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-10 shadow-xl shadow-slate-200/40">
          {/* STEP 1: Destination & Dates */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Where are you traveling?
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Enter your target destination city or region and the travel timeframe.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Destination
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    📍
                  </div>
                  <input
                    type="text"
                    required
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="e.g. Kyoto, Japan or Florence, Italy"
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition text-base font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition text-sm font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Budget & Group */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Budget & Party Size
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Gemini will keep activities, stays, dining, and transit strictly within this range.
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Total Budget Per Person (USD)
                  </label>
                  <span className="text-lg font-bold text-indigo-600">${Number(budget).toLocaleString()}</span>
                </div>
                <input
                  type="number"
                  min="50"
                  step="50"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition text-base font-semibold"
                />
                <div className="flex gap-2 mt-2">
                  {[500, 1000, 2000, 3500].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBudget(preset)}
                      className="px-3 py-1 rounded-lg text-xs font-medium border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 transition"
                    >
                      ${preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Number of Travelers
                </label>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setGroupSize((prev) => Math.max(1, prev - 1))}
                    className="w-12 h-12 rounded-xl border border-slate-200 hover:bg-slate-100 flex items-center justify-center font-bold text-lg text-slate-700 transition"
                  >
                    -
                  </button>
                  <div className="flex-1 text-center font-bold text-xl text-slate-900">
                    {groupSize} {groupSize === 1 ? 'Solo Traveler' : 'Travelers'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setGroupSize((prev) => prev + 1)}
                    className="w-12 h-12 rounded-xl border border-slate-200 hover:bg-slate-100 flex items-center justify-center font-bold text-lg text-slate-700 transition"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Travel Style & Interests */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Travel Style & Interests
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Customize the vibe and activities suited to your preferences.
                </p>
              </div>

              {/* Travel Style Grid */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2.5">
                  Trip Style
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {TRAVEL_STYLES.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setTravelStyle(style.id)}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        travelStyle === style.id
                          ? 'border-indigo-600 bg-indigo-50/60 shadow-sm shadow-indigo-100'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="font-bold text-sm text-slate-900">{style.label}</div>
                      <div className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-tight">
                        {style.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Interests Chips */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2.5">
                  Interests & Passions (Select all that apply)
                </label>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_OPTIONS.map((item) => {
                    const isSelected = interests.includes(item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleInterest(item.id)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Pace Slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Daily Pace
                  </label>
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                    {pace === 'relaxed' && 'Relaxed (4-5 activities)'}
                    {pace === 'moderate' && 'Balanced (5-7 activities)'}
                    {pace === 'fast' && 'Packed (7-9 activities)'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'relaxed', label: 'Relaxed', desc: 'Unhurried, ample free time' },
                    { id: 'moderate', label: 'Balanced', desc: 'Mix of sights & downtime' },
                    { id: 'fast', label: 'Packed', desc: 'See as much as possible' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPace(p.id)}
                      className={`p-3 rounded-xl border text-center transition ${
                        pace === p.id
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs">{p.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Extra Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Special Requests / Dietary Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Vegetarian dining preferred, no morning activities before 10 AM, wheelchair accessible..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition text-sm"
                />
              </div>
            </div>
          )}

          {/* STEP 4: Review & Generate */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Review Trip Parameters
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Double check your details before our AI model generates the complete schedule.
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/80 space-y-3.5">
                <div className="flex justify-between items-baseline py-1 border-b border-slate-200/60">
                  <span className="text-xs font-medium text-slate-500">Destination</span>
                  <span className="text-sm font-bold text-slate-900">{destination}</span>
                </div>
                <div className="flex justify-between items-baseline py-1 border-b border-slate-200/60">
                  <span className="text-xs font-medium text-slate-500">Dates</span>
                  <span className="text-sm font-bold text-slate-900">
                    {startDate} to {endDate}
                  </span>
                </div>
                <div className="flex justify-between items-baseline py-1 border-b border-slate-200/60">
                  <span className="text-xs font-medium text-slate-500">Target Budget</span>
                  <span className="text-sm font-bold text-slate-900">${Number(budget).toLocaleString()} per person</span>
                </div>
                <div className="flex justify-between items-baseline py-1 border-b border-slate-200/60">
                  <span className="text-xs font-medium text-slate-500">Party Size</span>
                  <span className="text-sm font-bold text-slate-900">{groupSize} traveler(s)</span>
                </div>
                <div className="flex justify-between items-baseline py-1 border-b border-slate-200/60">
                  <span className="text-xs font-medium text-slate-500">Style & Pace</span>
                  <span className="text-sm font-bold text-slate-900 capitalize">
                    {travelStyle} &bull; {pace}
                  </span>
                </div>
                <div className="flex justify-between items-baseline py-1">
                  <span className="text-xs font-medium text-slate-500">Interests</span>
                  <div className="text-xs font-semibold text-indigo-700 flex flex-wrap gap-1 justify-end max-w-xs">
                    {interests.join(', ') || 'General sightseeing'}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-start gap-3 text-xs text-indigo-900">
                <span className="text-base">✨</span>
                <p>
                  Gemini Flash will create day-by-day themes, optimal sequence of attractions, dining recommendations, and transit plans. You can edit any activity or regenerate specific days anytime!
                </p>
              </div>
            </div>
          )}

          {/* Form Actions (Back / Next / Generate) */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                &larr; Back
              </button>
            ) : (
              <div></div>
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-3 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-md shadow-indigo-200 transition"
              >
                Continue &rarr;
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                className="px-8 py-3.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-95 shadow-lg shadow-indigo-200 transition flex items-center gap-2"
              >
                <span>Generate Itinerary with AI</span>
                <span className="text-base">✨</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
