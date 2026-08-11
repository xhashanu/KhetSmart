import { useState, useEffect } from "react";
import type { AppLanguage } from "../hooks/useAppSettings";

export interface Order {
  id: string;
  date: string;
  time: string;
  crop: string;
  quantity: number;
  storageFee: number;
  logisticsCost: number;
  totalAmount: number;
  storageName: string;
  storageDistrict: string;
  storageLat?: number;
  storageLng?: number;
  farmDistrict: string;
  farmLat?: number;
  farmLng?: number;
  vendorName?: string;
  status: "Stored in Cold Storage" | "Listed for Auction" | "Pending" | "Sold via Auction";
  receiptContent: string;
  paymentMethod?: string;
}

type Props = {
  language: AppLanguage;
  formatInr: (n: number) => string;
  onGoFarmer: () => void;
  onGoAuction: () => void;
};

export function OrdersPanel({ language, formatInr, onGoFarmer, onGoAuction }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] = useState<Order | null>(null);
  const [orderForAuction, setOrderForAuction] = useState<Order | null>(null);
  const [isEditingAuction, setIsEditingAuction] = useState(false);
  const [startingBid, setStartingBid] = useState<number>(510);
  const [selectedMandi, setSelectedMandi] = useState<string>("Burdwan Hub Mandi");
  const [toast, setToast] = useState<string | null>(null);

  // Sync state with localStorage
  const loadOrders = () => {
    const loaded = localStorage.getItem("khetsmart_orders");
    if (loaded) {
      setOrders(JSON.parse(loaded));
    }
  };

  useEffect(() => {
    loadOrders();
    // Add custom window event listener so changes in other panels sync here instantly
    window.addEventListener("storage", loadOrders);
    return () => window.removeEventListener("storage", loadOrders);
  }, []);

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleDownloadReceipt = (order: Order) => {
    const blob = new Blob([order.receiptContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `khetsmart_receipt_${order.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    triggerToast(
      language === "bn"
        ? "রসিদ ডাউনলোড করা হয়েছে!"
        : language === "hi"
        ? "रसीद डाउनलोड हो गई है!"
        : "Receipt downloaded successfully!"
    );
  };

  const handleChangePaymentMethod = (order: Order, newMethod: string) => {
    let updatedReceipt = order.receiptContent;
    const lines = updatedReceipt.split("\n");
    const idx = lines.findIndex((l) => l.includes("Payment Method:"));
    if (idx !== -1) {
      lines[idx] = `Payment Method: ${newMethod}`;
      updatedReceipt = lines.join("\n");
    } else {
      const fareIdx = lines.findIndex(l => l.includes("FARE BREAKDOWN"));
      if (fareIdx !== -1) {
        lines.splice(fareIdx - 1, 0, "----------------------------------------", `Payment Method: ${newMethod}`);
        updatedReceipt = lines.join("\n");
      }
    }

    const updatedOrders = orders.map((o) => {
      if (o.id === order.id) {
        return {
          ...o,
          paymentMethod: newMethod,
          receiptContent: updatedReceipt
        };
      }
      return o;
    });

    setOrders(updatedOrders);
    localStorage.setItem("khetsmart_orders", JSON.stringify(updatedOrders));
    
    if (selectedOrderForReceipt && selectedOrderForReceipt.id === order.id) {
      setSelectedOrderForReceipt({
        ...selectedOrderForReceipt,
        paymentMethod: newMethod,
        receiptContent: updatedReceipt
      });
    }

    triggerToast(
      language === "bn"
        ? "পেমেন্ট পদ্ধতি সফলভাবে পরিবর্তন করা হয়েছে!"
        : language === "hi"
        ? "भुगतान विधि सफलतापूर्वक बदल दी गई है!"
        : "Payment method updated successfully!"
    );
  };

  const handleDelistAuction = (orderId: string) => {
    // 1. Remove from custom auctions
    const customAuctionsStr = localStorage.getItem("khetsmart_custom_auctions") || "[]";
    const customAuctions = JSON.parse(customAuctionsStr);
    const filteredAuctions = customAuctions.filter((a: any) => a.orderId !== orderId);
    localStorage.setItem("khetsmart_custom_auctions", JSON.stringify(filteredAuctions));

    // 2. Set order status back to Stored
    const updatedOrders = orders.map((o) => {
      if (o.id === orderId) {
        return { ...o, status: "Stored in Cold Storage" as const };
      }
      return o;
    });

    setOrders(updatedOrders);
    localStorage.setItem("khetsmart_orders", JSON.stringify(updatedOrders));

    // Trigger local storage event for sync
    window.dispatchEvent(new Event("storage"));

    triggerToast(
      language === "bn"
        ? "নিলাম বাতিল করা হয়েছে এবং ফসল স্টোরেজে ফিরে গেছে।"
        : language === "hi"
        ? "नीलामी रद्द कर दी गई है और फसल स्टोरेज में वापस आ गई है।"
        : "Auction delisted! Stored potatoes reverted to cold storage."
    );
  };

  const handleAuctionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderForAuction) return;

    const customAuctionsStr = localStorage.getItem("khetsmart_custom_auctions") || "[]";
    const customAuctions = JSON.parse(customAuctionsStr);

    if (isEditingAuction) {
      // MODIFY AUCTION
      const updated = customAuctions.map((a: any) => {
        if (a.orderId === orderForAuction.id) {
          return {
            ...a,
            mandi_name: selectedMandi,
            start_price_per_quintal: startingBid,
            current_bid_per_quintal: startingBid // reset current bid to starting price on modify
          };
        }
        return a;
      });
      localStorage.setItem("khetsmart_custom_auctions", JSON.stringify(updated));
      triggerToast(
        language === "bn"
          ? "নিলামের বিবরণ পরিবর্তন করা হয়েছে!"
          : language === "hi"
          ? "नीलामी का विवरण बदल दिया गया है!"
          : "Auction details modified successfully!"
      );
    } else {
      // NEW AUCTION LISTING
      const newAuction = {
        id: `auc-user-${Date.now()}`,
        mandi_name: selectedMandi,
        district: orderForAuction.storageDistrict,
        crop: orderForAuction.crop,
        quantity_quintals: orderForAuction.quantity,
        grade: "Premium (Stored)",
        start_price_per_quintal: startingBid,
        current_bid_per_quintal: startingBid,
        bidders: 0,
        ends_in_hours: 24,
        status: "live",
        isUserListed: true,
        orderId: orderForAuction.id,
        date_listed: new Date().toLocaleDateString()
      };

      customAuctions.unshift(newAuction);
      localStorage.setItem("khetsmart_custom_auctions", JSON.stringify(customAuctions));

      const updatedOrders = orders.map((o) => {
        if (o.id === orderForAuction.id) {
          return { ...o, status: "Listed for Auction" as const };
        }
        return o;
      });

      setOrders(updatedOrders);
      localStorage.setItem("khetsmart_orders", JSON.stringify(updatedOrders));

      triggerToast(
        language === "bn"
          ? "ফসল সফলভাবে নিলামে তালিকাভুক্ত করা হয়েছে!"
          : language === "hi"
          ? "फसल को सफलतापूर्वक नीलामी के लिए सूचीबद्ध किया गया है!"
          : "Harvest listed for auction successfully!"
      );
    }

    window.dispatchEvent(new Event("storage"));
    setOrderForAuction(null);

    // Redirect to auctions panel
    setTimeout(() => {
      onGoAuction();
    }, 1200);
  };

  // Translations
  const t = {
    title: language === "bn" ? "আমার বুকিং ও অর্ডার" : language === "hi" ? "मेरे बुकिंग और ऑर्डर" : "My Bookings & Orders",
    emptyTitle: language === "bn" ? "কোন বুকিং পাওয়া যায়নি" : language === "hi" ? "कोई बुकिंग नहीं मिली" : "No bookings found",
    emptyBody: language === "bn" ? "আপনি এখনও কোন কোল্ড স্টোরেজ বা ট্রাক বুক করেননি। আপনার মাঠের ফসল বিবরণ দিন এবং প্রথম বুকিং করুন!" : language === "hi" ? "आपने अभी तक कोई कोल्ड स्टोरेज या ट्रक बुक नहीं किया है। अपने खेत की फसल का विवरण दें और बुकिंग करें!" : "You haven't booked any cold storage or logistics partners yet. Describe your harvest and make your first booking!",
    emptyCta: language === "bn" ? "এখনই বুক করুন" : language === "hi" ? "अभी बुक करें" : "Book Now",
    statusStored: language === "bn" ? "কোল্ড স্টোরেজে সংরক্ষিত" : language === "hi" ? "कोल्ड स्टोरेज में सुरक्षित" : "Stored in Cold Storage",
    statusListed: language === "bn" ? "নিলামে তালিকাভুক্ত" : language === "hi" ? "नीलामी में सूचीबद्ध" : "Listed for Auction",
    statusSold: language === "bn" ? "নিলামে বিক্রি সম্পন্ন" : language === "hi" ? "नीलामी द्वारा बेचा गया" : "Sold via Auction",
    statusPending: language === "bn" ? "পেন্ডিং" : language === "hi" ? "लंबित" : "Pending",
    receiptTitle: language === "bn" ? "রসিদ দেখুন" : language === "hi" ? "रसीद देखें" : "View Receipt",
    receiptDownload: language === "bn" ? "ডাউনলোড করুন" : language === "hi" ? "ডাউনলোড करें" : "Download TXT",
    listAuction: language === "bn" ? "নিলামে তালিকাভুক্ত করুন" : language === "hi" ? "नीलामी में लिस्ट करें" : "List for Auction",
    qty: language === "bn" ? "পরিমাণ" : language === "hi" ? "मात्रा" : "Quantity",
    crop: language === "bn" ? "আলুর ধরন" : language === "hi" ? "आलू का प्रकार" : "Crop Type",
    storage: language === "bn" ? "স্টোরেজ" : language === "hi" ? "कोल्ड स्टोरेज" : "Cold Storage",
    totalPaid: language === "bn" ? "মোট প্রদেয় রাশি" : language === "hi" ? "कुल भुगतान" : "Total Amount Paid",
    modalListTitle: language === "bn" ? "নিলাম শুরু করুন" : language === "hi" ? "नीलामी शुरू करें" : "Start Mandi Auction",
    modalEditTitle: language === "bn" ? "নিলামের বিবরণ পরিবর্তন" : language === "hi" ? "नीलामी का विवरण बदलें" : "Modify Mandi Auction",
    mandiLabel: language === "bn" ? "নিলামের মান্ডি বাছুন" : language === "hi" ? "नीलामी की मंडी चुनें" : "Select Auction Mandi",
    startingBidLabel: language === "bn" ? "নিলামের শুরুর মূল্য (₹/কুইন্টাল)" : language === "hi" ? "नीलामी का प्रारंभिक मूल्य (₹/क्विंटल)" : "Starting Price (₹ per Quintal)",
    confirmListBtn: language === "bn" ? "নিলাম লাইভ করুন" : language === "hi" ? "नीलामी लाइव करें" : "Go Live on Mandi",
    confirmEditBtn: language === "bn" ? "পরিবর্তন সংরক্ষণ করুন" : language === "hi" ? "बदलाव सुरक्षित करें" : "Save Auction Changes",
    cancelBtn: language === "bn" ? "বাতিল" : language === "hi" ? "रद्द करें" : "Cancel",
    grn: language === "bn" ? "জিআরএন" : language === "hi" ? "जीआरएन" : "GRN",
    partner: language === "bn" ? "ট্রাক পার্টনার" : language === "hi" ? "ট্রक पार्टनर" : "Transport Partner",
    modifyBtn: language === "bn" ? "পরিবর্তন" : language === "hi" ? "बदलें" : "Modify",
    delistBtn: language === "bn" ? "নিলাম বাতিল" : language === "hi" ? "हटाएं" : "Delist"
  };

  const westBengalMandis = [
    "Burdwan Hub Mandi",
    "Malda APMC",
    "Hooghly Mandi",
    "Kolkata Wholesale Yard",
    "Bankura Krishak Bazaar"
  ];

  return (
    <div className="orders-view animate-in">
      <header className="finance-view__head" style={{ marginBottom: "1rem" }}>
        <h2 className="finance-view__title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "1.5rem" }}>📋</span>
          {t.title}
        </h2>
      </header>

      {toast && (
        <div className="finance-toast" style={{ position: "fixed", top: "80px", left: "50%", transform: "translateX(-50%)", zIndex: 1100, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          {toast}
        </div>
      )}

      {orders.length === 0 ? (
        <section className="finance-empty pro-card">
          <span className="finance-empty__icon" style={{ fontSize: "3rem" }} aria-hidden>
            📋
          </span>
          <h3>{t.emptyTitle}</h3>
          <p style={{ maxWidth: "340px", margin: "0 auto 16px auto" }}>{t.emptyBody}</p>
          <button type="button" className="btn-primary" onClick={onGoFarmer}>
            {t.emptyCta}
          </button>
        </section>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {orders.map((order) => {
            const isStored = order.status === "Stored in Cold Storage";
            const isListed = order.status === "Listed for Auction";
            const isSold = order.status === "Sold via Auction";
            
            return (
              <article
                key={order.id}
                className="pro-card"
                style={{
                  borderLeft: `4px solid ${isSold ? "#10b981" : isListed ? "#e8b923" : "#3d8f5f"}`,
                  padding: "16px",
                  position: "relative"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: "bold", fontSize: "0.9rem", color: "#3d4f44" }}>
                    {t.grn}: {order.id}
                  </span>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: "bold",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      backgroundColor: isSold ? "rgba(16, 185, 129, 0.15)" : isListed ? "rgba(232, 185, 35, 0.15)" : "rgba(61, 143, 95, 0.15)",
                      color: isSold ? "#10b981" : isListed ? "#e8b923" : "#3d8f5f"
                    }}
                  >
                    {order.status === "Stored in Cold Storage" ? t.statusStored : order.status === "Listed for Auction" ? t.statusListed : order.status === "Sold via Auction" ? t.statusSold : t.statusPending}
                  </span>
                </div>

                <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0 0 10px 0" }}>
                  ⏱ {order.date} · {order.time}
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.85rem", marginBottom: "12px" }}>
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>{t.crop}</span>
                    <strong style={{ color: "#1e293b" }}>{order.crop}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>{t.qty}</span>
                    <strong style={{ color: "#1e293b" }}>{order.quantity} Quintals</strong>
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>{t.storage}</span>
                    <strong style={{ color: "#1e293b" }}>{order.storageName} ({order.storageDistrict})</strong>
                  </div>
                  {order.vendorName && (
                    <div style={{ gridColumn: "span 2" }}>
                      <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>{t.partner}</span>
                      <strong style={{ color: "#3d8f5f" }}>🚛 {order.vendorName}</strong>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "10px", marginTop: "4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ color: "#64748b", fontSize: "0.75rem" }}>{t.totalPaid}:</span>
                    <strong style={{ display: "block", fontSize: "1.1rem", color: "#1e293b" }}>{formatInr(order.totalAmount)}</strong>
                  </div>

                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedOrderForReceipt(order)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        backgroundColor: "#fff",
                        color: "#475569",
                        fontSize: "0.8rem",
                        fontWeight: "bold",
                        cursor: "pointer"
                      }}
                    >
                      📄 {t.receiptTitle}
                    </button>

                    {isStored && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingAuction(false);
                          setOrderForAuction(order);
                          setStartingBid(520); // default starting price
                        }}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: "none",
                          backgroundColor: "#e8b923",
                          color: "#0f172a",
                          fontSize: "0.8rem",
                          fontWeight: "bold",
                          cursor: "pointer",
                          boxShadow: "0 2px 4px rgba(232, 185, 35, 0.3)"
                        }}
                      >
                        ⚡ {t.listAuction}
                      </button>
                    )}

                    {isListed && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingAuction(true);
                            setOrderForAuction(order);
                            // Populate values from existing custom auction
                            const customAuctions = JSON.parse(localStorage.getItem("khetsmart_custom_auctions") || "[]");
                            const matching = customAuctions.find((a: any) => a.orderId === order.id);
                            if (matching) {
                              setSelectedMandi(matching.mandi_name);
                              setStartingBid(matching.start_price_per_quintal);
                            }
                          }}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid #e8b923",
                            backgroundColor: "rgba(232, 185, 35, 0.05)",
                            color: "#b28910",
                            fontSize: "0.8rem",
                            fontWeight: "bold",
                            cursor: "pointer"
                          }}
                        >
                          ✏️ {t.modifyBtn}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelistAuction(order.id)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "none",
                            backgroundColor: "#ef4444",
                            color: "#fff",
                            fontSize: "0.8rem",
                            fontWeight: "bold",
                            cursor: "pointer"
                          }}
                        >
                          ❌ {t.delistBtn}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* VIRTUAL RECEIPT MODAL WITH EDITABLE PAYMENT METHOD */}
      {selectedOrderForReceipt && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px"
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "16px",
              padding: "20px",
              maxWidth: "420px",
              width: "100%",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
            }}
          >
            {/* PAPER RECEIPT COMPONENT */}
            <div
              style={{
                backgroundColor: "#f8fafc",
                color: "#0f172a",
                borderRadius: "12px",
                padding: "20px 16px",
                textAlign: "left",
                fontFamily: "monospace",
                fontSize: "0.78rem",
                lineHeight: "1.4",
                boxShadow: "inset 0 0 8px rgba(0,0,0,0.05)",
                marginBottom: "16px",
                border: "1px solid #cbd5e1"
              }}
            >
              <div style={{ textAlign: "center", borderBottom: "1px dashed #94a3b8", paddingBottom: "8px", marginBottom: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: "bold", letterSpacing: "1px", color: "#1e293b" }}>KHETSMART RECEIPT</h4>
                <span style={{ fontSize: "0.7rem", color: "#64748b" }}>{selectedOrderForReceipt.id} · {selectedOrderForReceipt.date}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div>
                  <strong style={{ color: "#475569", display: "block" }}>📍 PICKUP (FARM):</strong>
                  <span>District: {selectedOrderForReceipt.farmDistrict}</span><br />
                  {selectedOrderForReceipt.farmLat && (
                    <span>GPS: {selectedOrderForReceipt.farmLat?.toFixed(4)}°N, {selectedOrderForReceipt.farmLng?.toFixed(4)}°E</span>
                  )}
                </div>

                <div>
                  <strong style={{ color: "#475569", display: "block" }}>🏢 DELIVERY (STORAGE):</strong>
                  <span>Name: {selectedOrderForReceipt.storageName}</span><br />
                  <span>District: {selectedOrderForReceipt.storageDistrict}</span><br />
                  {selectedOrderForReceipt.storageLat && (
                    <span>GPS: {selectedOrderForReceipt.storageLat?.toFixed(4)}°N, {selectedOrderForReceipt.storageLng?.toFixed(4)}°E</span>
                  )}
                </div>

                <div>
                  <strong style={{ color: "#475569", display: "block" }}>🥔 LOAD DETAILS:</strong>
                  <span>Quantity: {selectedOrderForReceipt.quantity} Quintals ({selectedOrderForReceipt.crop})</span>
                </div>

                {selectedOrderForReceipt.vendorName && (
                  <div>
                    <strong style={{ color: "#475569", display: "block" }}>🚛 LOGISTICS PARTNER:</strong>
                    <span>{selectedOrderForReceipt.vendorName}</span>
                  </div>
                )}

                {selectedOrderForReceipt.paymentMethod && (
                  <div>
                    <strong style={{ color: "#475569", display: "block" }}>💳 PAYMENT METHOD:</strong>
                    <select
                      value={selectedOrderForReceipt.paymentMethod}
                      onChange={(e) => handleChangePaymentMethod(selectedOrderForReceipt, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px",
                        marginTop: "4px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "0.8rem",
                        backgroundColor: "#fff",
                        color: "#0f172a",
                        fontWeight: "bold",
                        fontFamily: "monospace"
                      }}
                    >
                      <option value="Razorpay (Online - Cards/Netbanking)">Razorpay Secure Online</option>
                      <option value="Instant UPI (GPay/PhonePe/Paytm)">Instant UPI</option>
                      <option value="Cash on Delivery (COD - Pay at Storage)">Cash on Delivery (COD)</option>
                      <option value="Cash Payment (Direct at Farm)">Cash (Direct at Farm)</option>
                    </select>
                  </div>
                )}

                <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "8px", marginTop: "4px" }}>
                  <strong style={{ color: "#475569", display: "block" }}>💵 FARE BREAKDOWN:</strong>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Cold Storage Booking Fee:</span>
                    <span>{formatInr(selectedOrderForReceipt.storageFee)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Logistics Transport Fee:</span>
                    <span>{formatInr(selectedOrderForReceipt.logisticsCost)}</span>
                  </div>
                </div>

                <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "8px", display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "0.85rem", color: "#0f172a" }}>
                  <span>TOTAL AMOUNT PAID:</span>
                  <span>{formatInr(selectedOrderForReceipt.totalAmount)}</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => handleDownloadReceipt(selectedOrderForReceipt)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#fff",
                  color: "#475569",
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
              >
                📥 {t.receiptDownload}
              </button>

              <button
                type="button"
                onClick={() => setSelectedOrderForReceipt(null)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#3d8f5f",
                  color: "#fff",
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DYNAMIC LIST / MODIFY AUCTION MODAL */}
      {orderForAuction && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px"
          }}
        >
          <form
            onSubmit={handleAuctionSubmit}
            style={{
              backgroundColor: "#fff",
              borderRadius: "16px",
              padding: "20px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              color: "#0f172a"
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "1.2rem", fontWeight: "bold", color: "#1e293b" }}>
              ⚡ {isEditingAuction ? t.modalEditTitle : t.modalListTitle}
            </h3>

            <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "16px", lineHeight: "1.4" }}>
              {isEditingAuction 
                ? (language === "bn" 
                    ? `মান্ডি নিলামে আপনার লাইভ ফসলের শুরুর মূল্য এবং বিক্রয়স্থল পরিবর্তন করুন।`
                    : `संशोधित करें अपनी लाइव आलू नीलामी का प्रारंभिक मूल्य और मंडी।`)
                : (language === "bn"
                    ? `আপনার কোল্ড স্টোরেজের (${orderForAuction.storageName}) আলু মান্ডি নিলামে তালিকাভুক্ত করুন যাতে বড় পাইকারী বিক্রেতারা সরাসরি বিড করতে পারেন।`
                    : `कोल्ड स्टोरेज (${orderForAuction.storageName}) में सुरक्षित आपके आलू को मंडी नीलामी के लिए लिस्ट करें।`)}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>
                  {t.mandiLabel}
                </label>
                <select
                  value={selectedMandi}
                  onChange={(e) => setSelectedMandi(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.85rem",
                    backgroundColor: "#fff"
                  }}
                >
                  {westBengalMandis.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>
                  {t.startingBidLabel}
                </label>
                <input
                  type="number"
                  min="300"
                  max="1500"
                  value={startingBid}
                  onChange={(e) => setStartingBid(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                    fontWeight: "bold"
                  }}
                  required
                />
              </div>

              <div
                style={{
                  backgroundColor: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "8px",
                  padding: "10px",
                  fontSize: "0.78rem",
                  color: "#166534"
                }}
              >
                🌾 <strong>{t.qty}: {orderForAuction.quantity} Quintals ({orderForAuction.crop})</strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setOrderForAuction(null)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#fff",
                  color: "#475569",
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
              >
                {t.cancelBtn}
              </button>

              <button
                type="submit"
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#e8b923",
                  color: "#0f172a",
                  fontWeight: "bold",
                  cursor: "pointer",
                  boxShadow: "0 4px 10px rgba(232, 185, 35, 0.3)"
                }}
              >
                🚀 {isEditingAuction ? t.confirmEditBtn : t.confirmListBtn}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
