import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeFarmerOtpSignup,
  fetchFarmerMe,
  farmerLogin,
  farmerLogout,
  sendFarmerOtp,
  setFarmerPin,
  verifyFarmerOtp,
  type FarmerAuthResponse,
  type FarmerProfile,
  type OtpVerifyResponse,
} from "../api";

const TOKEN_KEY = "khetsmart_farmer_token";

function applyAuthSuccess(
  data: FarmerAuthResponse,
  setToken: (t: string | null) => void,
  setFarmer: (f: FarmerProfile | null) => void
) {
  try {
    localStorage.setItem(TOKEN_KEY, data.token);
  } catch {
    /* ignore */
  }
  setToken(data.token);
  setFarmer(data.farmer);
}

export function useFarmerAuth() {
  const [farmer, setFarmer] = useState<FarmerProfile | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [hydrating, setHydrating] = useState(() => {
    try {
      return !!localStorage.getItem(TOKEN_KEY);
    } catch {
      return false;
    }
  });
  const profileLoadedRef = useRef(false);

  const persistToken = useCallback((t: string | null) => {
    setToken(t);
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    if (t) {
      // Authenticated
    } else {
      profileLoadedRef.current = false;
      setFarmer(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!token) {
        setHydrating(false);
        profileLoadedRef.current = false;
        return;
      }
      if (profileLoadedRef.current && farmer) {
        setHydrating(false);
        return;
      }
      setHydrating(true);
      try {
        const data = await fetchFarmerMe(token);
        if (!cancelled) {
          setFarmer(data.farmer);
          profileLoadedRef.current = true;
        }
      } catch {
        if (!cancelled) {
          persistToken(null);
          setFarmer(null);
          profileLoadedRef.current = false;
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [token, persistToken, farmer]);

  const sendOtp = useCallback((phone: string) => sendFarmerOtp(phone), []);

  const verifyOtp = useCallback(async (phone: string, otp: string) => {
    const data: OtpVerifyResponse = await verifyFarmerOtp(phone, otp);
    if (data.status === "logged_in" && data.token && data.farmer) {
      profileLoadedRef.current = true;
      applyAuthSuccess(
        { token: data.token, farmer: data.farmer },
        setToken,
        setFarmer
      );
      setHydrating(false);
      return { status: "logged_in" as const };
    }
    return {
      status: "needs_profile" as const,
      signup_token: data.signup_token!,
      phone: data.phone ?? phone,
    };
  }, []);

  const completeOtpSignup = useCallback(
    async (signupToken: string, name: string, district?: string | null) => {
      const data = await completeFarmerOtpSignup({
        signup_token: signupToken,
        name,
        district,
      });
      profileLoadedRef.current = true;
      applyAuthSuccess(data, setToken, setFarmer);
      setHydrating(false);
      return data.farmer;
    },
    []
  );

  const login = useCallback(async (phone: string, pin: string) => {
    const data = await farmerLogin({ phone, pin });
    profileLoadedRef.current = true;
    applyAuthSuccess(data, setToken, setFarmer);
    setHydrating(false);
    return data.farmer;
  }, []);

  const setPin = useCallback(
    async (pin: string, pinConfirm: string) => {
      if (!token) throw new Error("not_authenticated");
      const data = await setFarmerPin(token, pin, pinConfirm);
      setFarmer(data.farmer);
      return data.farmer;
    },
    [token]
  );

  const logout = useCallback(async () => {
    if (token) {
      try {
        await farmerLogout(token);
      } catch {
        /* ignore */
      }
    }
    persistToken(null);
    setFarmer(null);
    profileLoadedRef.current = false;
    try {
      sessionStorage.removeItem("khetsmart_onboarding_location_done");
    } catch {
      /* ignore */
    }
    setHydrating(false);
  }, [token, persistToken]);

  const isAuthenticated = !!farmer && !!token;

  return {
    farmer,
    token,
    isGuest: false,
    isAuthenticated,
    isReady: isAuthenticated,
    hydrating,
    sendOtp,
    verifyOtp,
    completeOtpSignup,
    login,
    setPin,
    logout,
    continueAsGuest: () => {},
  };
}
