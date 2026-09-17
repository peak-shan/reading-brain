import { Layout, Menu } from "antd";
import {
  BookOutlined,
  PlusCircleOutlined,
  TagsOutlined,
  HomeOutlined,
} from "@ant-design/icons";
import { Outlet, useNavigate, useLocation } from "react-router-dom";

const { Header, Content, Footer } = Layout;

const menuItems = [
  { key: "/", icon: <HomeOutlined />, label: "首页" },
  { key: "/add", icon: <PlusCircleOutlined />, label: "添加文章" },
  { key: "/tags", icon: <TagsOutlined />, label: "标签管理" },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // "添加文章" uses a drawer overlay on HomePage instead of a separate page.
  // Navigate to "/" and use a query flag to signal the drawer should open.
  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === "/add") {
      navigate("/?drawer=add", { replace: true });
    } else {
      navigate(key);
    }
  };

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
      </Header>
      <Content style={{ padding: "24px 48px" }}>
        <Outlet />
      </Content>
      <Footer style={{ textAlign: "center" }}>
        Reading Brain ©2026 — 轻量版 Readwise / 第二大脑
      </Footer>
    </Layout>
  );
}
