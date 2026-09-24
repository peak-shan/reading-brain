import { useState } from "react";
import { Layout, Menu, Button, Dropdown, Modal, Table, Popconfirm, App as AntdApp } from "antd";
import {
  BookOutlined,
  PlusCircleOutlined,
  TagsOutlined,
  HomeOutlined,
  UserOutlined,
  LogoutOutlined,
  LockOutlined,
  TeamOutlined,
  UserAddOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { clearToken, getStoredUsername, isAdmin, authApi } from "../services/api";
import type { User } from "../services/api";
import ChangePasswordModal from "./ChangePasswordModal";
import CreateSubAccountModal from "./CreateSubAccountModal";

const { Header, Content, Footer } = Layout;

const menuItems = [
  { key: "/", icon: <HomeOutlined />, label: "首页" },
  { key: "/add", icon: <PlusCircleOutlined />, label: "添加文章" },
  { key: "/tags", icon: <TagsOutlined />, label: "标签管理" },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntdApp.useApp();
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [subAccountModalOpen, setSubAccountModalOpen] = useState(false);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const username = getStoredUsername() || "admin";
  const admin = isAdmin();

  // "添加文章" uses a drawer overlay on HomePage instead of a separate page.
  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === "/add") {
      navigate("/?drawer=add", { replace: true });
    } else {
      navigate(key);
    }
  };

  // Load users list
  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const data = await authApi.listUsers();
      setUsers(data);
    } catch (err: unknown) {
      message.error("加载用户列表失败");
    } finally {
      setUsersLoading(false);
    }
  };

  // Delete user
  const handleDeleteUser = async (username: string) => {
    try {
      await authApi.deleteUser(username);
      message.success(`用户 ${username} 已删除`);
      setUsers(users.filter((u) => u.username !== username));
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      message.error(detail || "删除失败");
    }
  };

  // Open users modal
  const handleOpenUsersModal = async () => {
    setUsersModalOpen(true);
    await loadUsers();
  };

  // User dropdown menu
  const userMenuItems: MenuProps["items"] = [
    ...(admin
      ? [
          {
            key: "create-sub",
            icon: <UserAddOutlined />,
            label: "创建子账号",
            onClick: () => setSubAccountModalOpen(true),
          },
          {
            key: "manage-subs",
            icon: <TeamOutlined />,
            label: "子账号管理",
            onClick: handleOpenUsersModal,
          },
          { type: "divider" } as const,
        ]
      : []),
    {
      key: "change-password",
      icon: <LockOutlined />,
      label: "修改密码",
      onClick: () => setPwdModalOpen(true),
    },
    { type: "divider" } as const,
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
            {admin && <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 2 }}>(管理员)</span>}
          </Button>
        </Dropdown>
      </Header>
      <Content style={{ padding: "24px 48px" }}>
        <Outlet />
      </Content>
      <Footer style={{ textAlign: "center" }}>
        Reading Brain ©2026 — 轻量版 Readwise / 第二大脑
      </Footer>

      {/* Modals */}
      <ChangePasswordModal
        open={pwdModalOpen}
        onClose={() => setPwdModalOpen(false)}
      />
      <CreateSubAccountModal
        open={subAccountModalOpen}
        onClose={() => setSubAccountModalOpen(false)}
      />

      {/* Sub-account management modal */}
      <Modal
        title="子账号管理"
        open={usersModalOpen}
        onCancel={() => setUsersModalOpen(false)}
        footer={null}
        width={600}
      >
        <Table
          dataSource={users}
          rowKey="username"
          loading={usersLoading}
          pagination={false}
          columns={[
            { title: "用户名", dataIndex: "username", key: "username" },
            {
              title: "角色",
              dataIndex: "role",
              key: "role",
              render: (role: string) => (
                <span>{role === "admin" ? "管理员" : "子账号"}</span>
              ),
            },
            {
              title: "创建者",
              dataIndex: "created_by",
              key: "created_by",
              render: (v: string | null) => v || "—",
            },
            {
              title: "创建时间",
              dataIndex: "created_at",
              key: "created_at",
              render: (v: string) => v?.slice(0, 19).replace("T", " ") || "—",
            },
            {
              title: "操作",
              key: "action",
              render: (_: unknown, record: User) =>
                record.username !== "admin" ? (
                  <Popconfirm
                    title={`确定删除用户 ${record.username} 吗？`}
                    onConfirm={() => handleDeleteUser(record.username)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button type="link" danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                ) : (
                  <span style={{ color: "#999" }}>—</span>
                ),
            },
          ]}
        />
      </Modal>
    </Layout>
  );
}
