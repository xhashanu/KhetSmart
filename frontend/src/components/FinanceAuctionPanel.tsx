import { useEffect, useState } from "react";
import type { AppLanguage } from "../hooks/useAppSettings";
import { tFinance } from "../i18n/financeSimple";

type Props = {
  language: AppLanguage;
  formatInr: (n: number) => string;
};

export function FinanceAuctionPanel({ language, formatInr }: Props) {
  const t = tFinance(language);
  const [customAuctions, setCustomAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [highlightedAuctionId, setHighlightedAuctionId] = useState<string | null>(null);

  // Inline edit state
  const [editingAuctionId, setEditingAuctionId] = useState<string | null>(null);
  const [editMandi, setEditMandi] = useState("");
  const [editPrice, setEditPrice] = useState(500);

  // Sync custom auctions from localStorage
  const loadCustomAuctions = () => {
    setLoading(true);
    const local = localStorage.getItem("khetsmart_custom_auctions");
    if (local) {
      setCustomAuctions(JSON.parse(local));
    } else {
      setCustomAuctions([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCustomAuctions();
    window.addEventListener("storage", loadCustomAuctions);
    return () => window.removeEventListener("storage", loadCustomAuctions);
  }, []);

  // Dynamic Bidding Simulator for User Listed Auctions
  useEffect(() => {
    if (customAuctions.length === 0) return;

    const interval = setInterval(() => {
      // Pick a random user auction to receive a bid
      const liveAuctions = customAuctions.filter(a => a.status === "live");
      if (liveAuctions.length === 0) return;

      const idx = Math.floor(Math.random() * liveAuctions.length);
      const auction = liveAuctions[idx];

      if (auction) {
        const bidInc = Math.floor(4 + Math.random() * 8); // ₹4 to ₹11 increment
        const nextBid = auction.current_bid_per_quintal + bidInc;
        const nextBidders = auction.bidders + 1;

        // Flash highlight on the UI
        setHighlightedAuctionId(auction.id);
        setTimeout(() => setHighlightedAuctionId(null), 1200);

        const updated = customAuctions.map((a) => {
          if (a.id === auction.id) {
            return {
              ...a,
              current_bid_per_quintal: nextBid,
              bidders: nextBidders,
            };
          }
          return a;
        });

        setCustomAuctions(updated);
        localStorage.setItem("khetsmart_custom_auctions", JSON.stringify(updated));
      }
    }, 6000); // Trigger a new simulated bid every 6 seconds

    return () => clearInterval(interval);
  }, [customAuctions]);

  const handleAcceptBid = (auc: any) => {
    // End the auction and accept highest bid
    const updated = customAuctions.map((a) => {
      if (a.id === auc.id) {
        return { ...a, status: "completed", ends_in_hours: 0 };
      }
      return a;
    });
    setCustomAuctions(updated);
    localStorage.setItem("khetsmart_custom_auctions", JSON.stringify(updated));

    // Update order status in khetsmart_orders too
    const ordersStr = localStorage.getItem("khetsmart_orders");
    if (ordersStr) {
      const orders = JSON.parse(ordersStr);
      const updatedOrders = orders.map((o: any) => {
        if (o.id === auc.orderId) {
          return { ...o, status: "Sold via Auction" };
        }
        return o;
      });
      localStorage.setItem("khetsmart_orders", JSON.stringify(updatedOrders));
    }

    // Dispatch storage event to sync other panels
    window.dispatchEvent(new Event("storage"));

    setToast(
      language === "bn"
        ? `নিলাম সম্পন্ন! সর্ব্বোচ্চ বিড ₹${auc.current_bid_per_quintal}/কুইন্টাল মূল্যে বিক্রি চূড়ান্ত হয়েছে।`
        : language === "hi"
        ? `नीलामी पूरी हुई! अधिकतम बोली ₹${auc.current_bid_per_quintal}/क्विंटल पर बिक्री स्वीकार की गई।`
        : `Auction completed! Stored load sold successfully at the highest bid of ₹${auc.current_bid_per_quintal}/q.`
    );
    window.setTimeout(() => setToast(null), 5000);
  };

  const handleDelist = (auc: any) => {
    // 1. Remove from custom auctions
    const updated = customAuctions.filter((a) => a.id !== auc.id);
    setCustomAuctions(updated);
    localStorage.setItem("khetsmart_custom_auctions", JSON.stringify(updated));

    // 2. Revert order status back to "Stored in Cold Storage"
    const ordersStr = localStorage.getItem("khetsmart_orders");
    if (ordersStr) {
      const orders = JSON.parse(ordersStr);
      const updatedOrders = orders.map((o: any) => {
        if (o.id === auc.orderId) {
          return { ...o, status: "Stored in Cold Storage" };
        }
        return o;
      });
      localStorage.setItem("khetsmart_orders", JSON.stringify(updatedOrders));
    }

    window.dispatchEvent(new Event("storage"));
    setToast(
      language === "bn"
        ? "নিলাম বাতিল করা হয়েছে এবং ফসল কোল্ড স্টোরেজে ফেরত পাঠানো হয়েছে।"
        : "Auction delisted! Stored harvest returned to cold storage."
    );
    window.setTimeout(() => setToast(null), 4000);
  };

  const startEdit = (auc: any) => {
    setEditingAuctionId(auc.id);
    setEditMandi(auc.mandi_name);
    setEditPrice(auc.start_price_per_quintal);
  };

  const handleSaveEdit = (aucId: string) => {
    const updated = customAuctions.map((a) => {
      if (a.id === aucId) {
        return {
          ...a,
          mandi_name: editMandi,
          start_price_per_quintal: editPrice,
          current_bid_per_quintal: editPrice // reset current bid to starting price on modify
        };
      }
      return a;
    });
    setCustomAuctions(updated);
    localStorage.setItem("khetsmart_custom_auctions", JSON.stringify(updated));
    setEditingAuctionId(null);
    
    window.dispatchEvent(new Event("storage"));
    setToast(
      language === "bn"
        ? "নিলামের বিবরণ সফলভাবে পরিবর্তন করা হয়েছে!"
        : "Auction modified successfully!"
    );
    window.setTimeout(() => setToast(null), 3500);
  };

  const labelUserListing = language === "bn" ? "আপনার আলু নিলাম" : language === "hi" ? "आपकी आलू नीलामी" : "Your Active Auction";
  const labelAcceptBid = language === "bn" ? "সর্বোচ্চ বিড গ্রহণ করুন" : language === "hi" ? "अधिकतम बोली स्वीकार करें" : "Accept Highest Bid";
  const labelSold = language === "bn" ? "বিক্রি সম্পন্ন" : language === "hi" ? "बिक्री संपन्न" : "Sold Successfully";

  if (loading && customAuctions.length === 0) {
    return <div className="skeleton skeleton--tall" />;
  }

  return (
    <div className="finance-section finance-section--auction animate-in">
      <p className="finance-section__lead" style={{ marginBottom: "1.2rem" }}>
        {t.auctionSub}
      </p>

      {toast && <p className="finance-toast" style={{ position: "sticky", top: "10px", zIndex: 10 }}>{toast}</p>}

      <div className="finance-card-list">
        {customAuctions.length === 0 ? (
          <section className="finance-empty pro-card" style={{ marginTop: "10px", width: "100%", textAlign: "center", padding: "32px 16px" }}>
            <span className="finance-empty__icon" style={{ fontSize: "3rem", display: "block", marginBottom: "8px" }} aria-hidden>
              🌾
            </span>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "1.1rem" }}>
              {language === "bn" ? "নিলাম খালি" : "No live Mandi auctions"}
            </h3>
            <p style={{ maxWidth: "340px", margin: "0 auto 16px auto", fontSize: "0.85rem", color: "#64748b", lineHeight: "1.4" }}>
              {language === "bn" 
                ? "আপনার বুকিং ও অর্ডার বিভাগ থেকে স্টোর করা আলুর লট লাইভ মান্ডি নিলামে তালিকাভুক্ত করুন।"
                : "List your stored potato lots from your Bookings & Orders panel to receive competitive live bids from APMC wholesale traders."}
            </p>
          </section>
        ) : (
          customAuctions.map((a) => {
            const isLive = a.status === "live";
            const estTotal = a.current_bid_per_quintal * a.quantity_quintals;
            const isHighlighted = highlightedAuctionId === a.id;
            const isEditing = editingAuctionId === a.id;
            
            return (
              <article
                key={a.id}
                className="finance-offer-card finance-offer-card--live"
                style={{
                  border: isLive ? "2px solid #e8b923" : "2px solid #10b981",
                  background: isLive ? "linear-gradient(135deg, #fffcf3 0%, #fff 100%)" : "linear-gradient(135deg, #f0fdf4 0%, #fff 100%)",
                  boxShadow: isHighlighted ? "0 0 16px rgba(232, 185, 35, 0.4)" : "none",
                  transition: "all 0.4s ease",
                  transform: isHighlighted ? "scale(1.01)" : "scale(1)",
                  color: "#0f172a"
                }}
              >
                <div className="finance-offer-card__head" style={{ marginBottom: "6px" }}>
                  <strong>🏢 {a.mandi_name}</strong>
                  <span
                    className="finance-offer-card__badge"
                    style={{
                      backgroundColor: isLive ? "#e8b923" : "#10b981",
                      color: isLive ? "#0f172a" : "#fff",
                      fontSize: "0.7rem",
                      fontWeight: "bold",
                      borderRadius: "6px",
                      padding: "4px 8px"
                    }}
                  >
                    ⚡ {isLive ? labelUserListing : labelSold}
                  </span>
                </div>
                
                <p className="finance-offer-card__meta" style={{ color: "#475569", margin: "0 0 10px 0" }}>
                  📍 {a.district} · 📦 {a.quantity_quintals} q · 🌾 {a.crop} · Grade: {a.grade}
                </p>
                
                <div className="finance-offer-card__nums finance-offer-card__nums--auction" style={{ marginBottom: "8px" }}>
                  <span style={{ color: "#475569" }}>
                    {t.startingPrice}: ₹{a.start_price_per_quintal}/q
                  </span>
                  <span className="finance-offer-card__bid" style={{ color: isHighlighted ? "#3d8f5f" : "inherit" }}>
                    {t.currentBid}: <strong style={{ color: isLive ? "#e8b923" : "#10b981", fontSize: "1.15rem" }}>₹{a.current_bid_per_quintal}/q</strong>
                    {isHighlighted && <span style={{ fontSize: "0.75rem", color: "#3d8f5f", marginLeft: "6px", fontWeight: "bold" }}>↑ Bid Up!</span>}
                  </span>
                </div>
                
                <p className="finance-offer-card__total" style={{ color: "#0f172a", fontWeight: "bold", fontSize: "1.05rem", margin: "0 0 8px 0" }}>
                  ~{formatInr(estTotal)} {t.total}
                </p>
                
                <p className="finance-offer-card__meta" style={{ color: "#64748b", margin: "0 0 12px 0" }}>
                  👤 {a.bidders} {t.bidders} · {isLive ? `${t.ends} ${a.ends_in_hours} ${t.hours}` : "Auction Completed"}
                </p>

                {/* Inline Modification Form */}
                {isEditing && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px", borderTop: "1px dashed #cbd5e1", paddingTop: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "bold", color: "#475569", marginBottom: "2px" }}>Mandi:</label>
                      <select
                        value={editMandi}
                        onChange={(e) => setEditMandi(e.target.value)}
                        style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", backgroundColor: "#fff" }}
                      >
                        <option value="Burdwan Hub Mandi">Burdwan Hub Mandi</option>
                        <option value="Malda APMC">Malda APMC</option>
                        <option value="Hooghly Mandi">Hooghly Mandi</option>
                        <option value="Kolkata Wholesale Yard">Kolkata Wholesale Yard</option>
                        <option value="Bankura Krishak Bazaar">Bankura Krishak Bazaar</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "bold", color: "#475569", marginBottom: "2px" }}>Starting Price (₹/q):</label>
                      <input
                        type="number"
                        min="300"
                        max="1500"
                        value={editPrice}
                        onChange={(e) => setEditPrice(Number(e.target.value))}
                        style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", fontWeight: "bold" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                      <button
                        type="button"
                        onClick={() => setEditingAuctionId(null)}
                        style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.8rem", fontWeight: "bold", color: "#64748b" }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(a.id)}
                        style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "none", backgroundColor: "#3d8f5f", color: "#fff", cursor: "pointer", fontSize: "0.8rem", fontWeight: "bold" }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {isLive && !isEditing && (
                  <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleAcceptBid(a)}
                      style={{
                        flex: 2,
                        backgroundColor: "#3d8f5f",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        padding: "10px",
                        fontWeight: "bold",
                        fontSize: "0.85rem",
                        cursor: "pointer"
                      }}
                    >
                      🤝 {labelAcceptBid}
                    </button>

                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      style={{
                        flex: 1,
                        backgroundColor: "#fff",
                        color: "#b28910",
                        border: "1px solid #e8b923",
                        borderRadius: "8px",
                        padding: "10px",
                        fontWeight: "bold",
                        fontSize: "0.82rem",
                        cursor: "pointer"
                      }}
                    >
                      ✏️ Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelist(a)}
                      style={{
                        flex: 1,
                        backgroundColor: "#ef4444",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        padding: "10px",
                        fontWeight: "bold",
                        fontSize: "0.82rem",
                        cursor: "pointer"
                      }}
                    >
                      ❌ Delist
                    </button>
                  </div>
                )}

                {!isLive && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "8px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(16, 185, 129, 0.1)",
                      color: "#10b981",
                      textAlign: "center",
                      fontWeight: "bold",
                      fontSize: "0.85rem"
                    }}
                  >
                    ✓ {language === "bn" ? "আলু সফলভাবে বিক্রি সম্পন্ন হয়েছে!" : "Sold via KhetSmart Mandi Auction!"}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
