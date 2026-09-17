import { useState } from "react";
import { Layout, Menu, Button, Dropdown } from "antd";
import {
  BookOutlined,
  PlusCircleOutlined,
  TagsOutlined,
  HomeOutlined,
  UserOutlined,
  LogoutOutlined,
  LockOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { clearToken, getStoredUsername } from "../services/api";
import ChangePasswordModal from "./ChangePasswordModal";

const { Header, Content, Footer } = Layout;

const menuItems = [
  { key: "/", icon: <HomeOutlined />, label: "首页" },
  { key: "/add", icon: <PlusCircleOutlined />, label: "添加文章" },
  { key: "/tags", icon: <TagsOutlined />, label: "标签管理" },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [pwdModalOpen, setPwdModalOpen] = useState(false);

  const username = getStoredUsername() || "admin";

  // "添加文章" uses a drawer overlay on HomePage instead of a separate page.
  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === "/add") {
      navigate("/?drawer=add", { replace: true });
    } else {
      navigate(key);
    }
  };

  // User dropdown menu
  const userMenuItems: MenuProps["items"] = [
    {
      key: "change-password",
      icon: <LockOutlined />,
      label: "修改密码",
      onClick: () => setPwdModalOpen(true),
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "退出登录",
      danger: true,
      onClick: () => {
        clearToken();
        navigate("/login", { replace: true });
      },
    },
  ];

  // Keep "添加文章" highlighted when drawer query is active
  const selectedKey =
    location.pathname === "/" && location.search === "?drawer=add"
      ? "/add"
      : location.pathname;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{
            color: "#fff",
            fontSize: 18,
            fontWeight: 700,
            marginRight: 32,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <BookOutlined /> Reading Brain
        </div>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ flex: 1 }}
        />
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Button
            type="text"
            style={{ color: "#fff", display: "flex", alignItems: "center", gap: 4 }}
          >
            <UserOutlined />
            {username}
          </Button>
        </Dropdown>
      </Header>
      <Content style={{ padding: "24px 48px" }}>
        <Outlet />
      </Content>
      <Footer style={{ textAlign: "center" }}>
        Reading Brain ©2026 — 轻量版 Readwise / 第二大脑
      </Footer>

      {/* Change password modal */}
      <ChangePasswordModal
        open={pwdModalOpen}
        onClose={() => setPwdModalOpen(false)}
      />
    </Layout>
  );
}
