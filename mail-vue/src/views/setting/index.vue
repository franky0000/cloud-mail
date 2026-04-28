<template>
  <div class="box">
    <div class="container">
      <div class="title">{{ $t('profile') }}</div>
      <div class="item">
        <div>{{ $t('username') }}</div>
        <div>
          <span v-if="setNameShow" class="edit-name-input">
            <el-input v-model="accountName"></el-input>
            <span class="edit-name" @click="setName">
              {{ $t('save') }}
            </span>
          </span>
          <span v-else class="user-name">
            <span>{{ userStore.user.name }}</span>
            <span class="edit-name" @click="showSetName">
              {{ $t('change') }}
            </span>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{ $t('emailAccount') }}</div>
        <div>{{ userStore.user.email }}</div>
      </div>
      <div class="item">
        <div>{{ $t('phone') }}</div>
        <div>
          <span v-if="setPhoneShow" class="edit-name-input">
            <el-input v-model="phone"></el-input>
            <span class="edit-name" @click="setPhone">
              {{ $t('save') }}
            </span>
            <!-- <el-button class="edit-name" :loading="smsLoading" @click="sendTestSms">
              {{ '发送测试短信' }}
            </el-button> -->
          </span>
          <span v-else class="user-name">
            <span>{{ userStore.user.phone || $t('notSet') }}</span>
            <span class="edit-name" @click="showSetPhone">
              {{ $t('change') }}
            </span>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{ $t('password') }}</div>
        <div>
          <el-button type="primary" @click="pwdShow = true">{{ $t('changePwdBtn') }}</el-button>
        </div>
      </div>
    </div>
    <div class="del-email" v-perm="'my:delete'">
      <div class="title">{{ $t('deleteUser') }}</div>
      <div style="color: var(--regular-text-color)">
        {{ $t('delAccountMsg') }}
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">{{ $t('deleteUserBtn') }}</el-button>
      </div>
    </div>
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off" />
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off" />
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{ $t('save') }}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import { reactive, ref, defineOptions } from 'vue'
import { resetPassword, userDelete, updatePhone, sendSms } from '@/request/my.js'
import { useUserStore } from '@/store/user.js'
import router from '@/router/index.js'
import { accountSetName } from '@/request/account.js'
import { useAccountStore } from '@/store/account.js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const accountStore = useAccountStore()
const userStore = useUserStore()
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const setPhoneShow = ref(false)
const phone = ref(null)

defineOptions({
  name: 'setting'
})

function showSetName() {
  accountName.value = userStore.user.name
  setNameShow.value = true
}

function setName() {
  if (!accountName.value) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true
    })
    return
  }

  setNameShow.value = false
  let name = accountName.value

  if (name === userStore.user.name) {
    return
  }

  userStore.user.name = accountName.value

  accountSetName(userStore.user.account.accountId, name)
    .then(() => {
      ElMessage({
        message: t('saveSuccessMsg'),
        type: 'success',
        plain: true
      })

      accountStore.changeUserAccountName = name
    })
    .catch(() => {
      userStore.user.name = name
    })
}

function showSetPhone() {
  phone.value = userStore.user.phone
  setPhoneShow.value = true
}

function setPhone() {
  if (!phone.value) {
    ElMessage({
      message: t('emptyPhoneMsg'),
      type: 'error',
      plain: true
    })
    return
  }

  const phoneRegex = /^1[3-9]\d{9}$/
  if (!phoneRegex.test(phone.value)) {
    ElMessage({
      message: t('invalidPhoneMsg'),
      type: 'error',
      plain: true
    })
    return
  }

  setPhoneShow.value = false
  let newPhone = phone.value

  if (newPhone === userStore.user.phone) {
    return
  }

  userStore.user.phone = phone.value

  updatePhone(phone.value)
    .then(() => {
      ElMessage({
        message: t('saveSuccessMsg'),
        type: 'success',
        plain: true
      })
    })
    .catch(() => {
      userStore.user.phone = newPhone
    })
}

const smsLoading = ref(false)

function sendTestSms() {
  if (!userStore.user.phone) {
    ElMessage({
      message: t('notSet'),
      type: 'warning',
      plain: true
    })
    return
  }

  smsLoading.value = true
  sendSms(userStore.user.phone, '测试邮件')
    .then(() => {
      ElMessage({
        message: '短信发送成功',
        type: 'success',
        plain: true
      })
    })
    .catch((err) => {
      ElMessage({
        message: '短信发送失败: ' + (err.message || err),
        type: 'error',
        plain: true
      })
    })
    .finally(() => {
      smsLoading.value = false
    })
}

const pwdShow = ref(false)
const form = reactive({
  password: '',
  newPwd: ''
})

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token')
      router.replace('/login')
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true
      })
    })
  })
}

function submitPwd() {
  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.password)
    .then(() => {
      ElMessage({
        message: t('saveSuccessMsg'),
        type: 'success',
        plain: true
      })
      pwdShow.value = false
      setPwdLoading.value = false
      form.password = ''
      form.newPwd = ''
    })
    .catch(() => {
      setPwdLoading.value = false
    })
}
</script>
<style scoped lang="scss">
.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 30px 30px;
  }

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 20px;
    margin-bottom: 40px;

    .item {
      display: grid;
      grid-template-columns: 80px 1fr;
      gap: 140px;
      position: relative;
      .user-name {
        display: grid;
        grid-template-columns: auto 1fr;
        span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name-input {
        position: absolute;
        bottom: -6px;
        .el-input {
          width: min(200px, calc(100vw - 222px));
        }
      }

      .edit-name {
        color: #4dabff;
        padding-left: 10px;
        cursor: pointer;
      }

      @media (max-width: 767px) {
        gap: 70px;
      }

      div:first-child {
        font-weight: bold;
      }

      div:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
  }

  .del-email {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
}
</style>
