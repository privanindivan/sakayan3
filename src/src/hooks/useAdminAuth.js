import { useState } from 'react'

export function useAdminAuth() {
  const [isAdmin,     setIsAdmin]     = useState(() => sessionStorage.getItem('sakayan_admin') === '1')
  const [pendingCb,   setPendingCb]   = useState(null) // fn to run after auth
  const [showPinModal, setShowPinModal] = useState(false)

  function requireAdmin(callback) {
    if (isAdmin) { callback(); return }
    setPendingCb(() => callback)
    setShowPinModal(true)
  }

  function onPinSuccess() {
    sessionStorage.setItem('sakayan_admin', '1')
    setIsAdmin(true)
    setShowPinModal(false)
    if (pendingCb) { pendingCb(); setPendingCb(null) }
  }

  function onPinCancel() {
    setShowPinModal(false)
    setPendingCb(null)
  }

  return { isAdmin, requireAdmin, showPinModal, onPinSuccess, onPinCancel }
}
